import { useState } from 'react';
import { Clock, Mic, Flag, X, Check, ChevronRight } from 'lucide-react';
import { CATEGORY_COLORS, INTERVENTIONS, MEDICATIONS, RHYTHMS } from '@/lib/eventData';
import { format } from 'date-fns';

/**
 * EventLog — chronological list of logged events.
 *
 * Each event row has a "mark incorrect" flag that opens a 3-step correction flow:
 *   Step 1 (confirm)  — "Remove this event?"
 *   Step 2 (correct)  — "What did you mean?" command picker (voice events only)
 *   → calls onMarkIncorrect(event, intendedLabel | null)
 *
 * The intendedLabel may be:
 *   - A command label string → learning agent teaches this phrase → that label
 *   - 'none'               → pure false positive, no intended command
 *   - null                 → user dismissed before picking (button-press events)
 */
export default function EventLog({ events, onMarkIncorrect }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No events logged yet.<br />
        <span className="text-xs opacity-60">Say "EMIT" + action or tap a button</span>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="space-y-2">
      {sorted.map((event) => (
        <EventRow key={event.id} event={event} onMarkIncorrect={onMarkIncorrect} />
      ))}
    </div>
  );
}

// ── All loggable commands for the correction picker ───────────────────────────
// Grouped so the picker is scannable at a glance on a phone screen.
const CORRECTION_GROUPS = [
  {
    title: 'Cardiac',
    items: [
      { label: 'CPR Started',          category: 'cpr' },
      { label: 'ROSC',                 category: 'rosc' },
      { label: 'Efforts Discontinued', category: 'cpr' },
      ...RHYTHMS.map(r => ({ label: r.label, category: 'rhythm' })),
    ],
  },
  {
    title: 'Interventions',
    items: INTERVENTIONS.map(i => ({ label: i.label, category: 'intervention' })),
  },
  {
    title: 'Medications',
    items: MEDICATIONS.map(m => ({ label: m.label, category: 'medication' })),
  },
  {
    title: 'Other',
    items: [{ label: 'Patient Contact', category: 'notes' }],
  },
];

// Map category → text colour for the picker buttons
const PICKER_COLORS = {
  cpr:          'border-red-500/50     bg-red-500/10     text-red-300',
  rosc:         'border-green-500/50   bg-green-500/10   text-green-300',
  rhythm:       'border-purple-500/50  bg-purple-500/10  text-purple-300',
  intervention: 'border-blue-500/50   bg-blue-500/10   text-blue-300',
  medication:   'border-amber-500/50  bg-amber-500/10  text-amber-300',
  notes:        'border-slate-500/50  bg-slate-500/10  text-slate-300',
};

// ── EventRow ──────────────────────────────────────────────────────────────────

function EventRow({ event, onMarkIncorrect }) {
  // step: null | 'confirm' | 'correct'
  const [step, setStep] = useState(null);
  const isVoice = event.source === 'voice';

  const handleRemove = () => {
    if (isVoice && event.voiceTranscript) {
      // Voice event — ask what they meant before closing
      setStep('correct');
    } else {
      // Button-press event — just remove, no correction to collect
      onMarkIncorrect(event, null);
      setStep(null);
    }
  };

  const handleCorrectionPick = (intendedLabel) => {
    onMarkIncorrect(event, intendedLabel);
    setStep(null);
  };

  return (
    <div
      className={`rounded-lg border ${CATEGORY_COLORS[event.category] || CATEGORY_COLORS.notes} fade-in overflow-hidden`}
    >
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-70" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm">{event.label}</span>
            {isVoice && (
              <Mic className="w-3 h-3 opacity-60" aria-label="Logged via voice" />
            )}
          </div>

          {event.details && (
            <div className="text-xs opacity-70 mt-0.5">{event.details}</div>
          )}

          {/* Show what the mic heard so users can spot misrecognitions instantly */}
          {isVoice && event.voiceTranscript && (
            <div className="text-xs opacity-50 italic mt-0.5 font-mono">
              heard: "{event.voiceTranscript}"
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="font-mono text-xs opacity-60">
            {format(new Date(event.timestamp), 'HH:mm:ss')}
          </div>

          {/* Flag button — only shown in the default (no step active) state */}
          {!step && onMarkIncorrect && (
            <button
              onClick={(e) => { e.stopPropagation(); setStep('confirm'); }}
              className="p-1 -mr-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 btn-tap transition-colors"
              title="Mark this event as incorrect"
              aria-label="Mark incorrect"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Step 1 — Confirm removal */}
      {step === 'confirm' && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-current/20 bg-background/30">
          <span className="text-xs flex-1 opacity-80">
            {isVoice ? 'Remove and correct the recognizer?' : 'Remove this event?'}
          </span>
          <button
            onClick={() => setStep(null)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border border-border bg-secondary text-foreground hover:bg-muted btn-tap transition-colors"
          >
            <X className="w-3 h-3" /> Keep
          </button>
          <button
            onClick={handleRemove}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 btn-tap transition-colors"
          >
            <Check className="w-3 h-3" /> Remove
          </button>
        </div>
      )}

      {/* Step 2 — What did you mean? (voice events only) */}
      {step === 'correct' && (
        <CorrectionPicker
          transcript={event.voiceTranscript}
          wrongLabel={event.label}
          onPick={handleCorrectionPick}
          onSkip={() => { onMarkIncorrect(event, null); setStep(null); }}
        />
      )}
    </div>
  );
}

// ── CorrectionPicker ──────────────────────────────────────────────────────────

function CorrectionPicker({ transcript, wrongLabel, onPick, onSkip }) {
  return (
    <div className="border-t border-current/20 bg-background/40 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold opacity-90">What did you mean to say?</p>
          {transcript && (
            <p className="text-xs opacity-50 font-mono mt-0.5">heard: "{transcript}"</p>
          )}
        </div>
        <button
          onClick={onSkip}
          className="text-xs opacity-50 hover:opacity-80 underline btn-tap"
        >
          Skip
        </button>
      </div>

      {/* "Nothing / no command" — the most common correction */}
      <button
        onClick={() => onPick('none')}
        className="w-full text-left px-3 py-2 rounded-md text-xs font-semibold border border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 btn-tap transition-colors"
      >
        Nothing — it wasn't a command
      </button>

      {/* Command groups */}
      <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
        {CORRECTION_GROUPS.map(group => (
          <div key={group.title}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-40 mb-1">
              {group.title}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {group.items
                .filter(item => item.label !== wrongLabel) // skip the one we just removed
                .map(item => (
                  <button
                    key={item.label}
                    onClick={() => onPick(item.label)}
                    className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border btn-tap transition-colors hover:opacity-80 ${PICKER_COLORS[item.category] || PICKER_COLORS.notes}`}
                  >
                    <span className="truncate">{item.label}</span>
                    <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
