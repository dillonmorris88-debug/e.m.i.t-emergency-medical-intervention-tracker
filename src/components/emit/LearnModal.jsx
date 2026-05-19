import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, X, Plus, Trash2, BookOpen, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getVoiceAliases, saveVoiceAlias, removeVoiceAlias } from '@/hooks/useVoiceAliases';

export default function LearnModal({ item, onClose }) {
  const [aliases, setAliases] = useState(() => getVoiceAliases()[item.key] || []);
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [saved, setSaved] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(res => res[0].transcript)
        .join('');
      setLiveText(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        addAlias(transcript.trim().toLowerCase());
        setRecording(false);
        recognitionRef.current = null;
      }
    };
    r.onerror = () => { setRecording(false); recognitionRef.current = null; };
    r.onend = () => { setRecording(false); setLiveText(''); };
    recognitionRef.current = r;
    r.start();
    setRecording(true);
    setLiveText('');
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
    setLiveText('');
  };

  const addAlias = (phrase) => {
    if (!phrase) return;
    setAliases(prev => {
      const next = prev.includes(phrase) ? prev : [...prev, phrase];
      saveVoiceAlias(item.key, next);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const deleteAlias = (phrase) => {
    removeVoiceAlias(item.key, phrase);
    setAliases(prev => prev.filter(p => p !== phrase));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-6 pb-8 slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Learn</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground btn-tap">
            <X className="w-5 h-5" />
          </button>
        </div>
        <h2 className="text-xl font-black text-foreground mb-1">{item.label}</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Teach the app how you say this. Press the mic and speak naturally — your phrase will be saved and used for voice recognition.
        </p>

        {/* Suggested phrases */}
        <div className="mb-4 p-3 rounded-xl bg-secondary border border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Try saying something like…</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              `"${item.label.toLowerCase()}"`,
              `"give ${item.label.toLowerCase()}"`,
              `"pushed ${item.label.toLowerCase()}"`,
              `"log ${item.label.toLowerCase()}"`,
              `"administer ${item.label.toLowerCase()}"`,
            ].map(phrase => (
              <span key={phrase} className="text-xs font-mono px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary/80">
                {phrase}
              </span>
            ))}
          </div>
        </div>

        {/* Record Button */}
        <button
          onMouseDown={recording ? undefined : startRecording}
          onTouchStart={recording ? undefined : startRecording}
          onClick={recording ? stopRecording : undefined}
          className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-base border-2 btn-tap transition-all mb-4 ${
            recording
              ? 'border-red-500/80 bg-red-500/15 text-red-300 pulse-red'
              : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
          }`}
        >
          {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          {recording ? 'Tap to Stop' : 'Tap & Say It'}
        </button>

        {/* Live transcript */}
        {recording && (
          <div className="mb-4 p-3 rounded-xl bg-secondary border border-border text-sm text-muted-foreground italic min-h-[2.5rem]">
            {liveText || <span className="opacity-50">Listening...</span>}
          </div>
        )}

        {/* Saved aliases */}
        {aliases.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Saved Phrases</p>
            {aliases.map(phrase => (
              <div key={phrase} className="flex items-center justify-between bg-secondary rounded-xl px-4 py-2.5 border border-border">
                <span className="text-sm text-foreground">"{phrase}"</span>
                <button onClick={() => deleteAlias(phrase)} className="text-muted-foreground hover:text-destructive btn-tap ml-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {saved && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            Phrase saved!
          </div>
        )}

        {aliases.length === 0 && !recording && (
          <p className="text-center text-xs text-muted-foreground/50 mt-2">No custom phrases yet</p>
        )}
      </div>
    </div>
  );
}