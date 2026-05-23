import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, Syringe, Activity, ChevronLeft, FileText, Plus } from 'lucide-react';
import { autoSync, getPendingCount } from '@/lib/syncService';
import SyncIndicator from '@/components/emit/SyncIndicator';
import { getCall, saveCall, createNewCall } from '@/lib/callStorage';
import { startVoiceRecognition, stopVoiceRecognition } from '@/lib/voiceRecognition';
import CallTimer from '@/components/emit/CallTimer';
import CPRPanel from '@/components/emit/CPRPanel';
import InterventionPanel from '@/components/emit/InterventionPanel';
import MedicationPanel from '@/components/emit/MedicationPanel';
import EventLog from '@/components/emit/EventLog';
import VoiceIndicator from '@/components/emit/VoiceIndicator';
import VoiceConfirmModal from '@/components/emit/VoiceConfirmModal';
import TrainingModeModal from '@/components/emit/TrainingModeModal';
import BugReportModal from '@/components/emit/BugReportModal';
import { getVoiceAliases } from '@/hooks/useVoiceAliases';
import { INTERVENTIONS, MEDICATIONS, RHYTHMS } from '@/lib/eventData';
import {
  matchVoiceCommand,
  matchVoiceCommandNLU,
  COMMAND_MAP,
  STRICT_PROCEDURE_COMMANDS,
  STRICT_PROCEDURE_MIN_CONFIDENCE,
} from '@/lib/voiceCommandMatcher';
import {
  VoiceLearningAgent,
  CONFIRMATION_REQUIRED_COMMANDS,
  HIGH_CONFIDENCE_REQUIRED_COMMANDS,
  CONFIRMATION_CONFIDENCE_THRESHOLD,
} from '@/lib/voiceLearningAgent';
import { base44 } from '@/api/base44Client';
import { speak } from '@/lib/speak';

const TABS = [
  { key: 'interventions', label: 'Interventions', icon: Syringe,   color: 'text-blue-400' },
  { key: 'medications',   label: 'Medications',   icon: Activity,  color: 'text-amber-400' },
  { key: 'log',           label: 'Event Log',     icon: FileText,  color: 'text-slate-400' },
];

// All built-in command definitions passed to VoiceLearningAgent.predictCommand().
// Derived once from COMMAND_MAP so there's a single source of truth.
const KNOWN_COMMANDS_FOR_AGENT = COMMAND_MAP.map(entry => ({
  label:    entry.label || (entry.action === 'rosc' ? 'ROSC' : entry.action === 'cpr' ? 'CPR' : 'Efforts Discontinued'),
  keywords: entry.keywords,
}));

/** Convert a match object to its display label for the confirmation modal. */
function matchToLabel(match) {
  if (!match) return '';
  if (match.type === 'cpr')         return 'CPR Started';
  if (match.type === 'rosc')        return 'ROSC';
  if (match.type === 'discontinue') return 'Efforts Discontinued';
  return match.label || '';
}

/**
 * Determine whether a match at the given confidence level needs a user tap
 * before executing.
 *
 * Safety rules:
 *   - CONFIRMATION_REQUIRED_COMMANDS always prompt (Defib, Cardioversion,
 *     Efforts Discontinued) — these are irreversible or high clinical risk.
 *   - HIGH_CONFIDENCE_REQUIRED_COMMANDS (all medications, rhythms, ROSC)
 *     prompt when confidence < CONFIRMATION_CONFIDENCE_THRESHOLD (0.72).
 *   - Any other match below threshold also prompts.
 */
function shouldConfirm(match, confidence) {
  const label = matchToLabel(match);
  if (CONFIRMATION_REQUIRED_COMMANDS.has(label)) return true;
  if (HIGH_CONFIDENCE_REQUIRED_COMMANDS.has(label) && confidence < CONFIRMATION_CONFIDENCE_THRESHOLD) return true;
  if (confidence < CONFIRMATION_CONFIDENCE_THRESHOLD) return true;
  return false;
}

export default function ActiveCall() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const [call, setCall]                       = useState(null);
  const [activeTab, setActiveTab]             = useState('interventions');
  const [listening, setListening]             = useState(false);
  const [lastCommand, setLastCommand]         = useState('');
  const [liveTranscript, setLiveTranscript]   = useState('');
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [nluProcessing, setNluProcessing]     = useState(false);
  const [lastMatchedLabel, setLastMatchedLabel] = useState('');
  const [lastConfidence, setLastConfidence]   = useState(null);
  const [showBugReport, setShowBugReport]     = useState(false);
  const [showTraining, setShowTraining]       = useState(false);
  const [syncStatus, setSyncStatus]           = useState(navigator.onLine ? 'syncing' : 'offline');

  // Pending match waiting for user confirmation
  const [pendingMatch, setPendingMatch] = useState(null);
  // { match, label, confidence, transcript }

  const recognitionRef    = useRef(null);
  const wakeTimerRef      = useRef(null);
  const voiceCommandRef   = useRef(null);

  useEffect(() => {
    let c = callId ? getCall(callId) : null;
    if (!c) { c = createNewCall(); saveCall(c); }
    setCall(c);
  }, [callId]);

  useEffect(() => {
    if (call && !callId) navigate(`/call/${call.id}`, { replace: true });
  }, [call, callId, navigate]);

  // ── Action handlers ─────────────────────────────────────────────────────────

  const addEvent = useCallback((label, category, details = '') => {
    setCall(prev => {
      if (!prev) return prev;
      const cprEvent   = prev.events?.find(e => e.category === 'cpr' && e.label === 'CPR Started');
      const cprStart   = cprEvent ? new Date(cprEvent.timestamp).getTime() : null;
      const elapsed_seconds = cprStart ? Math.floor((Date.now() - cprStart) / 1000) : null;
      const newEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        category, label, details, elapsed_seconds,
      };
      const updated = { ...prev, events: [...(prev.events || []), newEvent] };
      saveCall(updated);
      return updated;
    });
    speak(label);
  }, []);

  const startCPR = useCallback(() => {
    setCall(prev => {
      if (!prev || prev.cpr_active) return prev;
      const withEvent = {
        ...prev, cpr_active: true,
        events: [...(prev.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'cpr', label: 'CPR Started', details: '', elapsed_seconds: 0,
        }],
      };
      saveCall(withEvent);
      return withEvent;
    });
    speak('CPR started');
  }, []);

  const handleROSC = useCallback(() => {
    setCall(prev => {
      if (!prev) return prev;
      const withEvent = {
        ...prev, cpr_active: false, rosc: true,
        events: [...(prev.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'rosc', label: 'ROSC', details: 'Return of Spontaneous Circulation', elapsed_seconds: null,
        }],
      };
      saveCall(withEvent);
      return withEvent;
    });
    speak('ROSC');
  }, []);

  const handleDiscontinue = useCallback(() => {
    setCall(prev => {
      if (!prev) return prev;
      const withEvent = {
        ...prev, cpr_active: false, discontinued: true,
        events: [...(prev.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'cpr', label: 'Efforts Discontinued', details: '', elapsed_seconds: null,
        }],
      };
      saveCall(withEvent);
      return withEvent;
    });
    speak('Efforts discontinued');
  }, []);

  const markRhythm = useCallback((rhythm) => {
    setCall(prev => {
      if (!prev) return prev;
      const withEvent = {
        ...prev, current_rhythm: rhythm,
        events: [...(prev.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'rhythm', label: `Rhythm: ${rhythm}`, details: '', elapsed_seconds: null,
        }],
      };
      saveCall(withEvent);
      return withEvent;
    });
    speak(`Rhythm: ${rhythm}`);
  }, []);

  const handleEndCall = useCallback(() => {
    setCall(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ended_at: new Date().toISOString() };
      saveCall(updated);
      return updated;
    });
    navigate('/');
  }, [navigate]);

  // ── Match execution ──────────────────────────────────────────────────────────

  const applyMatch = useCallback((match) => {
    if (!match) return;
    if (match.type === 'cpr')         { startCPR();           setLastMatchedLabel('CPR Started'); return; }
    if (match.type === 'rosc')        { handleROSC();         setLastMatchedLabel('ROSC'); return; }
    if (match.type === 'discontinue') { handleDiscontinue();  setLastMatchedLabel('Efforts Discontinued'); return; }
    if (match.type === 'event') {
      setLastMatchedLabel(match.label);
      if (match.category === 'rhythm') { markRhythm(match.label); return; }
      addEvent(match.label, match.category);
    }
  }, [addEvent, startCPR, handleROSC, handleDiscontinue, markRhythm]);

  // ── Tag voice events ─────────────────────────────────────────────────────────
  // Voice-triggered commands flow through the existing add/start/mark handlers,
  // which leaves no record of *how* the event was created. After a voice-driven
  // action fires, we update the last event in the call to mark it as voice-sourced
  // and store the original transcript — used by EventLog's mark-incorrect button.
  const tagLastEventAsVoice = useCallback((transcript, confidence) => {
    setCall(prev => {
      if (!prev?.events?.length) return prev;
      const events = [...prev.events];
      const i = events.length - 1;
      events[i] = {
        ...events[i],
        source: 'voice',
        voiceTranscript: transcript,
        voiceConfidence: confidence,
      };
      const updated = { ...prev, events };
      saveCall(updated);
      return updated;
    });
  }, []);

  // ── Voice command pipeline ───────────────────────────────────────────────────

  const handleVoiceCommand = useCallback(async (cmd, rawConfidence = 0.5) => {
    // ── 1. Keyword match (fast, offline, no network needed) ──────────────────
    const aliases      = getVoiceAliases();
    const keywordMatch = matchVoiceCommand(cmd, aliases, INTERVENTIONS, MEDICATIONS);

    // ── 2. Learning agent prediction (local, improves with training) ──────────
    const agentPrediction = VoiceLearningAgent.predictCommand(cmd, KNOWN_COMMANDS_FOR_AGENT);

    // ── 3. Pick the best match ────────────────────────────────────────────────
    let bestMatch      = null;
    let bestConfidence = 0;

    if (keywordMatch) {
      bestMatch      = keywordMatch;
      bestConfidence = keywordMatch.confidence ?? 0.90;
    }

    // Agent beats keyword only when it found a learned phrase with higher confidence.
    if (agentPrediction.command && agentPrediction.confidence > bestConfidence) {
      const agentMatch = labelToMatch(agentPrediction.command);
      if (agentMatch) {
        bestMatch      = agentMatch;
        bestConfidence = agentPrediction.confidence;
      }
    }

    // ── 4. NLU fallback (cloud, only when both keyword + agent fail) ──────────
    if (!bestMatch) {
      setNluProcessing(true);
      const nluMatch = await matchVoiceCommandNLU(
        cmd, INTERVENTIONS, MEDICATIONS,
        (params) => base44.integrations.Core.InvokeLLM(params)
      );
      setNluProcessing(false);

      // Nothing matched at any tier — tell the user clearly instead of failing
      // silently or guessing. Required by the IV/IO/Intubation over-match fix.
      if (!nluMatch) {
        speak('Command not recognized');
        setLastMatchedLabel('');
        setLastConfidence(null);
        return;
      }

      // NLU is the lowest-trust tier (0.65). It MUST NOT be allowed to trigger
      // strict procedure commands — that was the path producing phantom
      // IV / IO / Intubation logs from unclear or hallucinated speech.
      if (STRICT_PROCEDURE_COMMANDS.has(matchToLabel(nluMatch))) {
        speak('Command not recognized');
        setLastMatchedLabel('');
        setLastConfidence(null);
        return;
      }

      bestMatch      = nluMatch;
      bestConfidence = nluMatch.confidence ?? 0.65;
    }

    setLastConfidence(bestConfidence);

    // ── 5. Strict procedure guard ─────────────────────────────────────────────
    // IV Access, IO Access, and Intubation will only fire on a clear, high
    // confidence match. Below that bar we refuse the command outright — no
    // confirmation prompt, no auto-execute. This kills the "any phrase with
    // the letters iv/io/intubat triggers a procedure" class of bug.
    const bestLabel = matchToLabel(bestMatch);
    if (STRICT_PROCEDURE_COMMANDS.has(bestLabel) && bestConfidence < STRICT_PROCEDURE_MIN_CONFIDENCE) {
      speak('Command not recognized');
      setLastMatchedLabel('');
      setLastConfidence(null);
      return;
    }

    // ── 6. Safety gate: confirm dangerous or uncertain commands ───────────────
    if (shouldConfirm(bestMatch, bestConfidence)) {
      setPendingMatch({
        match:      bestMatch,
        label:      bestLabel,
        confidence: bestConfidence,
        transcript: cmd,
      });
      return;
    }

    // ── 7. Auto-execute ───────────────────────────────────────────────────────
    applyMatch(bestMatch);
    tagLastEventAsVoice(cmd, bestConfidence);

    // ── 8. Learn from successful execution (passive improvement from usage) ──
    VoiceLearningAgent.learn(bestLabel, null, cmd, null, bestConfidence);
  }, [applyMatch, tagLastEventAsVoice]);

  // ── Confirmation handlers ────────────────────────────────────────────────────

  const handleConfirmMatch = useCallback(() => {
    if (!pendingMatch) return;
    applyMatch(pendingMatch.match);
    tagLastEventAsVoice(pendingMatch.transcript, pendingMatch.confidence);
    // Teach the agent: user confirmed this transcript → this command.
    VoiceLearningAgent.learn(
      pendingMatch.label,
      null,
      pendingMatch.transcript,
      null,
      // Boost confidence slightly to reward confirmed matches.
      Math.min((pendingMatch.confidence ?? 0) + 0.1, 1.0)
    );
    setPendingMatch(null);
  }, [pendingMatch, applyMatch, tagLastEventAsVoice]);

  const handleRejectMatch = useCallback(() => {
    setPendingMatch(null);
  }, []);

  // ── Mark event as incorrectly interpreted ────────────────────────────────────
  // Removes the event from the call and — if it was voice-triggered — tells
  // the VoiceLearningAgent to weaken or forget the bad transcript→label mapping.
  const handleMarkEventIncorrect = useCallback((event) => {
    if (!event) return;

    // Teach the agent (only if we have voice metadata; button presses just delete)
    if (event.source === 'voice' && event.voiceTranscript) {
      // The label stored in events for rhythms is "Rhythm: V-Fib"; the agent
      // tracks the bare label ("V-Fib"). Strip the "Rhythm:" prefix.
      const labelForAgent = event.category === 'rhythm'
        ? (event.label || '').replace(/^Rhythm:\s*/i, '')
        : event.label;
      VoiceLearningAgent.recordIncorrectMatch(labelForAgent, event.voiceTranscript);
    }

    // Remove the event from the call
    setCall(prev => {
      if (!prev) return prev;
      const events = (prev.events || []).filter(e => e.id !== event.id);
      const updated = { ...prev, events };

      // Roll back transient state if we're removing the last marker of it
      if (event.label === 'CPR Started') {
        // No remaining CPR Started event → CPR is no longer "in progress"
        if (!events.some(e => e.category === 'cpr' && e.label === 'CPR Started')) {
          updated.cpr_active = false;
        }
      }
      if (event.category === 'rosc') {
        if (!events.some(e => e.category === 'rosc')) updated.rosc = false;
      }
      if (event.label === 'Efforts Discontinued') {
        if (!events.some(e => e.label === 'Efforts Discontinued')) updated.discontinued = false;
      }
      if (event.category === 'rhythm') {
        // Recompute current rhythm from the most recent remaining rhythm event
        const lastRhythm = [...events].reverse().find(e => e.category === 'rhythm');
        updated.current_rhythm = lastRhythm
          ? lastRhythm.label.replace(/^Rhythm:\s*/i, '')
          : null;
      }

      saveCall(updated);
      return updated;
    });
  }, []);

  // ── Recognition lifecycle ────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    recognitionRef.current = startVoiceRecognition(
      () => {
        setLastCommand('');
        setLastMatchedLabel('');
        setLastConfidence(null);
        setWakeWordDetected(true);
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = setTimeout(() => setWakeWordDetected(false), 1500);
      },
      (cmd, confidence) => {
        setLastCommand(cmd);
        setLiveTranscript('');
        voiceCommandRef.current?.(cmd, confidence);
      },
      (interim) => setLiveTranscript(interim)
    );
    if (recognitionRef.current) setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    stopVoiceRecognition(recognitionRef.current);
    recognitionRef.current = null;
    setListening(false);
    setLiveTranscript('');
    setWakeWordDetected(false);
  }, []);

  // Keep ref current so the recognition callback always calls the latest handler.
  useEffect(() => { voiceCommandRef.current = handleVoiceCommand; }, [handleVoiceCommand]);

  useEffect(() => {
    const unsub = autoSync((status) => setSyncStatus(status));
    return unsub;
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) stopListening(); else startListening();
  }, [listening, startListening, stopListening]);

  // Auto-start recognition once per call.
  useEffect(() => {
    if (!call) return;
    startListening();
    return () => stopListening();
  }, [call?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!call) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors btn-tap"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Calls</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">E.M.i.T.</span>
          <CallTimer startedAt={call.started_at} />
          <SyncIndicator status={syncStatus} pendingCount={getPendingCount()} />
        </div>
        <button
          onClick={handleEndCall}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-destructive/20 border border-destructive/50 text-destructive hover:bg-destructive/30 btn-tap transition-all"
        >
          End Call
        </button>
      </div>

      {/* Voice Indicator */}
      <div className="px-4 py-2 border-b border-border">
        <VoiceIndicator
          listening={listening}
          lastCommand={lastCommand}
          liveTranscript={liveTranscript}
          wakeWordDetected={wakeWordDetected}
          onToggle={toggleListening}
          nluProcessing={nluProcessing}
          lastMatchedLabel={lastMatchedLabel}
          lastConfidence={lastConfidence}
          onOpenTraining={() => {
            stopListening();
            setShowTraining(true);
          }}
        />
      </div>

      {/* CPR Button or Panel */}
      <div className="px-4 pt-3">
        {!call.cpr_active && !call.rosc && !call.discontinued ? (
          <button
            onClick={startCPR}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-base border-2 border-red-500/60 bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:border-red-400 btn-tap glow-red transition-all"
          >
            <Heart className="w-5 h-5" fill="currentColor" />
            CPR IN PROGRESS
          </button>
        ) : call.rosc ? (
          <div className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold border border-green-500/50 bg-green-500/10 text-green-300 glow-green">
            <Activity className="w-5 h-5" />
            ROSC ACHIEVED
          </div>
        ) : call.discontinued ? (
          <div className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold border border-slate-500/50 bg-slate-500/10 text-slate-400">
            Efforts Discontinued
          </div>
        ) : (
          <CPRPanel
            call={call}
            onEvent={addEvent}
            onROSC={handleROSC}
            onDiscontinue={handleDiscontinue}
            onRhythm={markRhythm}
          />
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 px-4 pt-3">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border btn-tap transition-all ${
              activeTab === tab.key
                ? 'bg-secondary border-border text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.key ? tab.color : ''}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-6">
        {activeTab === 'interventions' && (
          <InterventionPanel
            onEvent={addEvent}
            onBugReport={() => setShowBugReport(true)}
            onVoicePause={stopListening}
            onVoiceResume={startListening}
          />
        )}
        {activeTab === 'medications' && (
          <MedicationPanel
            onEvent={addEvent}
            onBugReport={() => setShowBugReport(true)}
            onVoicePause={stopListening}
            onVoiceResume={startListening}
          />
        )}
        {activeTab === 'log' && (
          <EventLog events={call.events} onMarkIncorrect={handleMarkEventIncorrect} />
        )}
      </div>

      {/* Quick Note FAB */}
      <div className="fixed bottom-6 right-6">
        <button
          onClick={() => {
            const note = prompt('Quick note:');
            if (note) addEvent(note, 'notes');
          }}
          className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center shadow-lg hover:border-primary/50 btn-tap transition-all"
        >
          <Plus className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Voice confirmation modal — shown for low-confidence or always-confirm commands */}
      <VoiceConfirmModal
        pending={pendingMatch}
        onConfirm={handleConfirmMatch}
        onReject={handleRejectMatch}
      />

      {/* Training Mode modal */}
      {showTraining && (
        <TrainingModeModal
          onClose={() => {
            setShowTraining(false);
            startListening(); // resume recognition after training session
          }}
        />
      )}

      {showBugReport && (
        <BugReportModal call={call} onClose={() => setShowBugReport(false)} />
      )}
    </div>
  );
}

// ── Helpers (module-level, not hooks) ─────────────────────────────────────────

/**
 * Convert a VoiceLearningAgent label back to the match format expected by applyMatch().
 * Returns null if the label is not recognized.
 */
function labelToMatch(label) {
  if (!label) return null;
  if (label === 'CPR')                  return { type: 'cpr' };
  if (label === 'ROSC')                 return { type: 'rosc' };
  if (label === 'Efforts Discontinued') return { type: 'discontinue' };

  if (RHYTHMS.find(r => r.label === label))
    return { type: 'event', label, category: 'rhythm' };
  if (INTERVENTIONS.find(i => i.label === label))
    return { type: 'event', label, category: 'intervention' };
  if (MEDICATIONS.find(m => m.label === label))
    return { type: 'event', label, category: 'medication' };

  // Custom / notes events
  return { type: 'event', label, category: 'notes' };
}
