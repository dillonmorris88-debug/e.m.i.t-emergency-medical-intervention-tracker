import { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Square, RotateCcw, Activity } from 'lucide-react';
import { RHYTHMS } from '@/lib/eventData';
import { TEACH_HIGHLIGHT } from '@/components/emit/DraggableButtonGrid';
import { speak } from '@/lib/speak';

const CPR_INTERVAL = 120; // 2 minutes
// Seconds before the pulse check when the timer turns amber and the prompt is spoken.
const PULSE_CHECK_WARNING_SECONDS = 20;
const PULSE_CHECK_PROMPT = '20 seconds to pulse check, charge the monitor and find pulse points';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function CPRPanel({ call, onEvent, onROSC, onDiscontinue, onRhythm, highlight }) {
  const hl = highlight ? TEACH_HIGHLIGHT : '';
  const [codeSeconds, setCodeSeconds] = useState(0);
  // Starts full so the "Pulse Check" state can't flash before the first tick.
  const [cprSeconds, setCprSeconds] = useState(CPR_INTERVAL);
  const [cprWarning, setCprWarning] = useState(false);
  const [overdueSeconds, setOverdueSeconds] = useState(0);
  // Start time of the cycle whose 20-second prompt has already been spoken.
  const announcedCycleRef = useRef(null);

  // Code timer — runs from CPR start
  useEffect(() => {
    if (!call.cpr_active && !call.rosc && !call.discontinued) return;
    const cprEvent = call.events?.find(e => e.category === 'cpr' && e.label === 'CPR Started');
    if (!cprEvent) return;
    const start = new Date(cprEvent.timestamp).getTime();
    const tick = () => setCodeSeconds(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.cpr_active, call.rosc, call.discontinued]);

  // Most recent rhythm declaration — restarts the 2-minute CPR cycle when it changes.
  const rhythmEvents = (call.events || []).filter(e => e.category === 'rhythm');
  const lastRhythmTs = rhythmEvents.length ? rhythmEvents[rhythmEvents.length - 1].timestamp : null;

  // CPR cycle timer — counts down to the 2-minute pulse check, then holds at
  // 00:00 (counting time overdue) until a rhythm is declared, which starts the
  // next full 2-minute cycle. It never restarts on its own.
  useEffect(() => {
    if (!call.cpr_active) return;
    const cprEvent = call.events?.find(e => e.category === 'cpr' && e.label === 'CPR Started');
    const cprStart = cprEvent ? new Date(cprEvent.timestamp).getTime() : Date.now();
    const started = lastRhythmTs ? new Date(lastRhythmTs).getTime() : cprStart;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, CPR_INTERVAL - elapsed);
      setCprSeconds(remaining);
      setOverdueSeconds(Math.max(0, elapsed - CPR_INTERVAL));
      setCprWarning(remaining <= PULSE_CHECK_WARNING_SECONDS);

      // Spoken prompt once per cycle. `<=` rather than `===` so a delayed
      // tick can't skip it; `> 0` so reopening an overdue call stays quiet.
      if (remaining > 0 && remaining <= PULSE_CHECK_WARNING_SECONDS && announcedCycleRef.current !== started) {
        announcedCycleRef.current = started;
        speak(PULSE_CHECK_PROMPT);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.cpr_active, lastRhythmTs]);

  // Cycle finished; waiting for a rhythm to start the next one.
  const pulseCheckDue = call.cpr_active && cprSeconds === 0;

  const handleResetCPR = useCallback(() => {
    onEvent('CPR Reset', 'cpr');
  }, [onEvent]);

  return (
    <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-4 slide-up">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5 text-red-400 pulse-red" fill="currentColor" />
        <span className="font-bold text-red-300 text-lg tracking-wide">CODE IN PROGRESS</span>
      </div>

      {/* Timers */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-background/60 rounded-lg p-3 text-center border border-border">
          <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-1">Code Timer</div>
          <div className="font-mono text-3xl font-bold text-red-300">{formatTime(codeSeconds)}</div>
          <div className="text-xs text-muted-foreground mt-1">Continuous</div>
        </div>
        <div className={`rounded-lg p-3 text-center border transition-colors duration-300 ${cprWarning ? 'bg-amber-500/20 border-amber-400' : 'bg-background/60 border-border'}`}>
          <div className={`text-xs font-semibold tracking-widest uppercase mb-1 ${cprWarning ? 'text-amber-300' : 'text-muted-foreground'}`}>
            {pulseCheckDue ? 'Pulse Check' : 'CPR Timer'}
          </div>
          <div className={`font-mono text-3xl font-bold ${cprWarning ? 'text-amber-300' : 'text-foreground'} ${pulseCheckDue ? 'animate-pulse' : ''}`}>{formatTime(cprSeconds)}</div>
          {pulseCheckDue && (
            <div className="text-xs font-semibold text-amber-300 mt-1">
              Select rhythm · +{formatTime(overdueSeconds)}
            </div>
          )}
          <button
            onClick={handleResetCPR}
            className="mt-1 text-xs text-muted-foreground flex items-center gap-1 mx-auto hover:text-foreground transition-colors btn-tap"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* Rhythm Buttons */}
      <div className="mb-4">
        <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-2">Rhythm</div>
        <div className="grid grid-cols-4 gap-2">
          {RHYTHMS.map(r => (
            <button
              key={r.key}
              onClick={() => onRhythm(r.label)}
              className={`py-2 px-1 rounded-lg text-xs font-bold border btn-tap transition-all ${hl}
                ${call.current_rhythm === r.label
                  ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                  : pulseCheckDue
                    ? 'bg-secondary border-amber-400/70 text-foreground hover:border-purple-400/50'
                    : 'bg-secondary border-border text-muted-foreground hover:border-purple-400/50 hover:text-foreground'
                }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ROSC / Discontinue */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onROSC}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-green-600/20 border border-green-500 text-green-300 hover:bg-green-600/40 btn-tap glow-green transition-all ${hl}`}
        >
          <Activity className="w-4 h-4" />
          ROSC
        </button>
        <button
          onClick={onDiscontinue}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-slate-700/40 border border-slate-500 text-slate-300 hover:bg-slate-600/40 btn-tap transition-all ${hl}`}
        >
          <Square className="w-4 h-4" />
          Discontinue
        </button>
      </div>
    </div>
  );
}