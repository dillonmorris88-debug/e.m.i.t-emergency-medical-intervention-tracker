import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, Syringe, Activity, ChevronLeft, FileText, Plus } from 'lucide-react';
import { getCall, saveCall, createNewCall } from '@/lib/callStorage';
import { startVoiceRecognition, stopVoiceRecognition } from '@/lib/voiceRecognition';
import CallTimer from '@/components/emit/CallTimer';
import CPRPanel from '@/components/emit/CPRPanel';
import InterventionPanel from '@/components/emit/InterventionPanel';
import MedicationPanel from '@/components/emit/MedicationPanel';
import EventLog from '@/components/emit/EventLog';
import VoiceIndicator from '@/components/emit/VoiceIndicator';

const TABS = [
  { key: 'interventions', label: 'Interventions', icon: Syringe, color: 'text-blue-400' },
  { key: 'medications', label: 'Medications', icon: Activity, color: 'text-amber-400' },
  { key: 'log', label: 'Event Log', icon: FileText, color: 'text-slate-400' },
];

export default function ActiveCall() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const [call, setCall] = useState(null);
  const [activeTab, setActiveTab] = useState('interventions');
  const [listening, setListening] = useState(false);
  const [lastCommand, setLastCommand] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const recognitionRef = useRef(null);
  const wakeTimerRef = useRef(null);

  useEffect(() => {
    let c = callId ? getCall(callId) : null;
    if (!c) {
      c = createNewCall();
      saveCall(c);
    }
    setCall(c);
  }, [callId]);

  // Auto-navigate to call URL if new
  useEffect(() => {
    if (call && !callId) {
      navigate(`/call/${call.id}`, { replace: true });
    }
  }, [call, callId, navigate]);

  // --- All action handlers defined FIRST ---

  const addEvent = useCallback((label, category, details = '') => {
    setCall(prev => {
      if (!prev) return prev;
      const cprEvent = prev.events?.find(e => e.category === 'cpr' && e.label === 'CPR Started');
      const cprStart = cprEvent ? new Date(cprEvent.timestamp).getTime() : null;
      const elapsed_seconds = cprStart ? Math.floor((Date.now() - cprStart) / 1000) : null;
      const newEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        category,
        label,
        details,
        elapsed_seconds,
      };
      const updated = { ...prev, events: [...(prev.events || []), newEvent] };
      saveCall(updated);
      return updated;
    });
  }, []);

  const startCPR = useCallback(() => {
    setCall(prev => {
      if (!prev || prev.cpr_active) return prev;
      const updated = { ...prev, cpr_active: true };
      const withEvent = {
        ...updated,
        events: [...(updated.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'cpr',
          label: 'CPR Started',
          details: '',
          elapsed_seconds: 0,
        }]
      };
      saveCall(withEvent);
      return withEvent;
    });
  }, []);

  const handleROSC = useCallback(() => {
    setCall(prev => {
      if (!prev) return prev;
      const updated = { ...prev, cpr_active: false, rosc: true };
      const withEvent = {
        ...updated,
        events: [...(updated.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'rosc',
          label: 'ROSC',
          details: 'Return of Spontaneous Circulation',
          elapsed_seconds: null,
        }]
      };
      saveCall(withEvent);
      return withEvent;
    });
  }, []);

  const handleDiscontinue = useCallback(() => {
    setCall(prev => {
      if (!prev) return prev;
      const updated = { ...prev, cpr_active: false, discontinued: true };
      const withEvent = {
        ...updated,
        events: [...(updated.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'cpr',
          label: 'Efforts Discontinued',
          details: '',
          elapsed_seconds: null,
        }]
      };
      saveCall(withEvent);
      return withEvent;
    });
  }, []);

  const markRhythm = useCallback((rhythm) => {
    setCall(prev => {
      if (!prev) return prev;
      const updated = { ...prev, current_rhythm: rhythm };
      const withEvent = {
        ...updated,
        events: [...(updated.events || []), {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'rhythm',
          label: `Rhythm: ${rhythm}`,
          details: '',
          elapsed_seconds: null,
        }]
      };
      saveCall(withEvent);
      return withEvent;
    });
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

  // --- Voice handlers defined AFTER their dependencies ---

  const handleVoiceCommand = useCallback((cmd) => {
    const lower = cmd.toLowerCase();
    if (lower.includes('iv') || lower.includes('intravenous')) {
      addEvent('IV Access', 'intervention');
    } else if (lower.includes('io')) {
      addEvent('IO Access', 'intervention');
    } else if (lower.includes('spinal')) {
      addEvent('Spinal Restriction', 'intervention');
    } else if (lower.includes('bvm')) {
      addEvent('BVM', 'intervention');
    } else if (lower.includes('airway')) {
      addEvent('Airway Placement', 'intervention');
    } else if (lower.includes('epi') && lower.includes('drip')) {
      addEvent('Dirty Epi Drip', 'medication');
    } else if (lower.includes('epi') || lower.includes('epinephrine')) {
      addEvent('Epinephrine', 'medication');
    } else if (lower.includes('fentanyl')) {
      addEvent('Fentanyl', 'medication');
    } else if (lower.includes('ketamine')) {
      addEvent('Ketamine', 'medication');
    } else if (lower.includes('ativan')) {
      addEvent('Ativan', 'medication');
    } else if (lower.includes('versed')) {
      addEvent('Versed', 'medication');
    } else if (lower.includes('ofirmev') || lower.includes('offirmev')) {
      addEvent('Ofirmev', 'medication');
    } else if (lower.includes('fluid') || lower.includes('bolus')) {
      addEvent('Fluid Bolus', 'medication');
    } else if (lower.includes('cpr')) {
      startCPR();
    } else if (lower.includes('rosc')) {
      handleROSC();
    } else if (lower.includes('vfib') || lower.includes('v fib') || lower.includes('v-fib')) {
      markRhythm('V-Fib');
    } else if (lower.includes('vtach') || lower.includes('v tach') || lower.includes('v-tach')) {
      markRhythm('V-Tach');
    } else if (lower.includes('pea')) {
      markRhythm('PEA');
    } else if (lower.includes('asystole')) {
      markRhythm('Asystole');
    }
  }, [addEvent, startCPR, handleROSC, markRhythm]);

  const startListening = useCallback((voiceCommandHandler) => {
    recognitionRef.current = startVoiceRecognition(
      () => {
        setLastCommand('');
        setWakeWordDetected(true);
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = setTimeout(() => setWakeWordDetected(false), 1500);
      },
      (cmd) => {
        setLastCommand(cmd);
        setLiveTranscript('');
        voiceCommandHandler(cmd);
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

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening(handleVoiceCommand);
  }, [listening, startListening, stopListening, handleVoiceCommand]);

  // Voice recognition — auto-start
  useEffect(() => {
    if (!call) return;
    startListening(handleVoiceCommand);
    return () => stopListening();
  }, [call?.id]);

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
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors btn-tap">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Calls</span>
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">E.M.i.T.</span>
          <CallTimer startedAt={call.started_at} />
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
          <InterventionPanel onEvent={addEvent} />
        )}
        {activeTab === 'medications' && (
          <MedicationPanel onEvent={addEvent} />
        )}
        {activeTab === 'log' && (
          <EventLog events={call.events} />
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
    </div>
  );
}