import { useState, useRef } from 'react';
import { X, Mic, MicOff, CheckCircle2, RotateCcw, Trash2, Brain, ChevronDown, ChevronUp, AlertCircle, Key, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react';
import { VoiceLearningAgent } from '@/lib/voiceLearningAgent';
import { clearAllVoiceAliases } from '@/hooks/useVoiceAliases';
import { INTERVENTIONS, MEDICATIONS, RHYTHMS } from '@/lib/eventData';
import { getWhisperApiKey, setWhisperApiKey } from '@/lib/speechProvider';

const REQUIRED_SAMPLES = 3;

const CATEGORY_STYLE = {
  cpr:          'border-red-500/40 bg-red-500/10 text-red-300',
  rosc:         'border-green-500/40 bg-green-500/10 text-green-300',
  rhythm:       'border-purple-500/40 bg-purple-500/10 text-purple-300',
  intervention: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  medication:   'border-amber-500/40 bg-amber-500/10 text-amber-300',
  notes:        'border-slate-500/40 bg-slate-500/10 text-slate-300',
};

/** Every command the user can train. */
const ALL_COMMANDS = [
  { label: 'CPR',                 key: 'cpr',                 category: 'cpr' },
  { label: 'ROSC',                key: 'rosc',                category: 'rosc' },
  { label: 'Efforts Discontinued',key: 'efforts_discontinued', category: 'cpr' },
  { label: 'Patient Contact',     key: 'patient_contact',      category: 'notes' },
  ...RHYTHMS.map(r => ({ ...r, category: 'rhythm' })),
  ...INTERVENTIONS.map(i => ({ ...i, category: 'intervention' })),
  ...MEDICATIONS.map(m => ({ ...m, category: 'medication' })),
];

const CATEGORY_GROUPS = [
  { key: 'cpr',          label: 'CPR / Outcomes' },
  { key: 'rhythm',       label: 'Rhythms' },
  { key: 'intervention', label: 'Interventions' },
  { key: 'medication',   label: 'Medications' },
];

/**
 * Training Mode — guided multi-sample voice training for any EMiT command.
 *
 * Privacy note:
 *   Audio recordings are NOT saved. Only text transcripts (what the engine
 *   heard) and confidence scores are stored, in localStorage under
 *   'emit_voice_learning'. The "Delete All Learned Data" button here removes
 *   that storage entirely.
 */
export default function TrainingModeModal({ onClose }) {
  const [step, setStep]               = useState('pick'); // 'pick' | 'train' | 'done'
  const [selectedCommand, setSelected] = useState(null);
  const [samples, setSamples]          = useState([]);
  const [recording, setRecording]      = useState(false);
  const [liveText, setLiveText]        = useState('');
  const [showDeleteConfirm, setShowDelete] = useState(false);
  const [deleted, setDeleted]          = useState(false);
  const [expandedGroup, setExpanded]   = useState('cpr');

  // Whisper API key management
  const [apiKey, setApiKey]           = useState(() => getWhisperApiKey());
  const [apiKeyInput, setApiKeyInput] = useState(() => getWhisperApiKey());
  const [showKey, setShowKey]         = useState(false);
  const [keySaved, setKeySaved]       = useState(false);

  const recognitionRef = useRef(null);

  // ── Recording helpers ─────────────────────────────────────────────────────

  const startRecording = () => {
    if (recognitionRef.current || !selectedCommand) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 3;

    r.onresult = (e) => {
      const text = Array.from(e.results).map(res => res[0].transcript).join('');
      setLiveText(text);

      if (e.results[e.results.length - 1].isFinal) {
        const phrase = text.trim().toLowerCase();
        const conf   = e.results[e.results.length - 1][0].confidence ?? 0.7;

        r.onend = null;
        recognitionRef.current = null;
        setRecording(false);
        setLiveText('');

        // Teach the agent this phrase variant for this command.
        VoiceLearningAgent.learn(selectedCommand.label, null, phrase, null, conf);

        setSamples(prev => {
          const next = [...prev, { phrase, confidence: conf }];
          if (next.length >= REQUIRED_SAMPLES) setStep('done');
          return next;
        });
      }
    };

    r.onerror = () => { recognitionRef.current = null; setRecording(false); setLiveText(''); };
    r.onend   = () => { recognitionRef.current = null; setRecording(false); setLiveText(''); };

    recognitionRef.current = r;
    try { r.start(); } catch { recognitionRef.current = null; return; }
    setRecording(true);
  };

  const stopRecording = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.onend = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.onresult = null;
    try { recognitionRef.current.abort(); } catch {}
    recognitionRef.current = null;
    setRecording(false);
    setLiveText('');
  };

  // ── API key helpers ───────────────────────────────────────────────────────

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    setWhisperApiKey(trimmed);
    setApiKey(trimmed);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleClearKey = () => {
    setWhisperApiKey('');
    setApiKey('');
    setApiKeyInput('');
  };

  // ── Delete all learned data ───────────────────────────────────────────────

  const handleDeleteAll = () => {
    VoiceLearningAgent.clearAllData(); // removes 'emit_voice_learning' from localStorage
    clearAllVoiceAliases();            // removes 'emit_voice_aliases' from localStorage
    setShowDelete(false);
    setDeleted(true);
  };

  const resetTraining = () => {
    setStep('pick');
    setSelected(null);
    setSamples([]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-t-3xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-widest">Training Mode</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-8">

          {/* ── Step: Pick command ─────────────────────────────────────────── */}
          {step === 'pick' && (
            <>
              {/* ── Recognition Engine / API Key ────────────────────────────── */}
              <div className="mt-4 mb-5 rounded-xl border border-border bg-secondary overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  {apiKey
                    ? <Wifi className="w-4 h-4 text-green-400 flex-shrink-0" />
                    : <WifiOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  <span className="text-xs font-bold text-foreground">Recognition Engine</span>
                  <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded-full border ${
                    apiKey
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : 'border-border text-muted-foreground'
                  }`}>
                    {apiKey ? 'Whisper API' : 'Web Speech (offline)'}
                  </span>
                </div>

                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    {apiKey
                      ? 'Using OpenAI Whisper for high-accuracy transcription. Audio is sent to OpenAI and not stored.'
                      : 'Enter an OpenAI API key to enable Whisper — significantly more accurate, especially on iOS.'}
                  </p>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKeyInput}
                        onChange={e => setApiKeyInput(e.target.value)}
                        placeholder="sk-..."
                        className="w-full pl-8 pr-9 py-2 text-xs rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button
                      onClick={handleSaveKey}
                      disabled={!apiKeyInput.trim() || apiKeyInput.trim() === apiKey}
                      className="px-3 py-2 rounded-lg text-xs font-bold border border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {keySaved ? '✓ Saved' : 'Save'}
                    </button>

                    {apiKey && (
                      <button
                        onClick={handleClearKey}
                        className="px-3 py-2 rounded-lg text-xs font-bold border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {keySaved && (
                    <p className="mt-2 text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Whisper API active — reload the page (or re-open a call) to apply.
                    </p>
                  )}

                  <p className="mt-2 text-xs text-muted-foreground/50">
                    Key stored only on this device in localStorage. Never uploaded by EMiT.
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Select a command, then say it {REQUIRED_SAMPLES} times.
                The app will learn your accent, timing, and phrasing.
              </p>

              {/* Privacy note */}
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-secondary border border-border flex gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
                <span>
                  Only text transcripts are stored — no audio recordings.
                  All training data stays on this device.
                </span>
              </div>

              {CATEGORY_GROUPS.map(group => {
                const cmds = ALL_COMMANDS.filter(c => c.category === group.key);
                const open = expandedGroup === group.key;
                return (
                  <div key={group.key} className="mb-2">
                    <button
                      onClick={() => setExpanded(open ? null : group.key)}
                      className="w-full flex items-center justify-between py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {group.label}
                      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {open && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {cmds.map(cmd => (
                          <button
                            key={cmd.key}
                            onClick={() => { setSelected(cmd); setStep('train'); setSamples([]); }}
                            className={`py-2.5 px-3 rounded-xl text-sm font-semibold border text-left active:scale-95 transition-all ${CATEGORY_STYLE[cmd.category]}`}
                          >
                            {cmd.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Delete all data */}
              <div className="mt-6 border-t border-border pt-5">
                {!showDeleteConfirm && !deleted && (
                  <button
                    onClick={() => setShowDelete(true)}
                    className="flex items-center gap-2 text-sm text-destructive/70 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete all learned voice data
                  </button>
                )}
                {showDeleteConfirm && (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/40">
                    <p className="text-sm font-semibold text-destructive mb-3">
                      Delete all learned phrases and custom aliases?
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      This removes all text transcripts stored by Training Mode and the Learn
                      feature. Audio recordings are never stored — there is nothing else to delete.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowDelete(false)}
                        className="flex-1 py-2 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAll}
                        className="flex-1 py-2 rounded-lg bg-destructive/20 border border-destructive text-destructive text-sm font-bold hover:bg-destructive/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
                {deleted && (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    All learned voice data deleted.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Step: Train ────────────────────────────────────────────────── */}
          {step === 'train' && selectedCommand && (
            <>
              <div className="mt-4 mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Training</p>
                <h2 className="text-2xl font-black text-foreground">{selectedCommand.label}</h2>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-2 mb-5">
                {Array.from({ length: REQUIRED_SAMPLES }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full transition-all ${
                      i < samples.length ? 'bg-green-500' : 'bg-secondary border border-border'
                    }`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {samples.length}/{REQUIRED_SAMPLES}
                </span>
              </div>

              <div className="mb-4 px-3 py-2 rounded-xl bg-secondary border border-border text-sm text-muted-foreground">
                Say it naturally, just as you would during a call. Include how you'd normally word it
                (e.g. "gave the epi", "pushed epi", "epinephrine given").
              </div>

              {/* Record button */}
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={samples.length >= REQUIRED_SAMPLES}
                className={`w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-bold text-lg border-2 transition-all mb-4 active:scale-95 ${
                  recording
                    ? 'border-red-500/80 bg-red-500/15 text-red-300'
                    : samples.length >= REQUIRED_SAMPLES
                    ? 'border-border bg-secondary text-muted-foreground cursor-not-allowed'
                    : 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {recording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                {recording ? 'Tap to Stop' : samples.length >= REQUIRED_SAMPLES ? 'Done' : `Say it (${samples.length + 1} of ${REQUIRED_SAMPLES})`}
              </button>

              {/* Live transcript */}
              {recording && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-secondary border border-border text-sm text-muted-foreground italic min-h-[2.5rem]">
                  {liveText || <span className="opacity-50">Listening…</span>}
                </div>
              )}

              {/* Saved samples */}
              {samples.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recorded</p>
                  {samples.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-2.5 border border-border">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="text-sm text-foreground flex-1">"{s.phrase}"</span>
                      <span className="text-xs text-muted-foreground">{Math.round(s.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={resetTraining}
                className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Choose a different command
              </button>
            </>
          )}

          {/* ── Step: Done ─────────────────────────────────────────────────── */}
          {step === 'done' && selectedCommand && (
            <div className="mt-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-2xl font-black text-foreground mb-2">Learning complete!</h2>
              <p className="text-sm text-muted-foreground mb-2">
                <span className="font-semibold text-foreground">{selectedCommand.label}</span> has been
                trained with {samples.length} phrase samples.
              </p>
              <p className="text-xs text-muted-foreground mb-8">
                The app will now recognize how you say this command more accurately.
                Recognition improves further with every successful command during normal use.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={resetTraining}
                  className="py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Train another
                </button>
                <button
                  onClick={onClose}
                  className="py-3 rounded-xl bg-primary/20 border border-primary/60 text-primary text-sm font-bold hover:bg-primary/30"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
