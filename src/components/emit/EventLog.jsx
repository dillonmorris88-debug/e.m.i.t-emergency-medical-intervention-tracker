import { useState } from 'react';
import { Clock, Mic, Flag, X, Check } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/eventData';
import { format } from 'date-fns';

/**
 * EventLog — chronological list of logged events.
 *
 * Each event row exposes a "mark incorrect" flag button:
 *   - For voice-triggered events, this also teaches the VoiceLearningAgent
 *     that the transcript → label mapping was wrong (see onMarkIncorrect).
 *   - For button-triggered events, it just removes the entry.
 *
 * Voice-sourced events display a small mic icon and the original transcript
 * so the user can see exactly what was heard.
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

function EventRow({ event, onMarkIncorrect }) {
  const [confirming, setConfirming] = useState(false);
  const isVoice = event.source === 'voice';

  return (
    <div
      className={`rounded-lg border ${CATEGORY_COLORS[event.category] || CATEGORY_COLORS.notes} fade-in overflow-hidden`}
    >
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

          {/* Show the original transcript for voice events so users see what was heard */}
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

          {/* Mark-incorrect button */}
          {!confirming && onMarkIncorrect && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
              className="p-1 -mr-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 btn-tap transition-colors"
              title="Mark this event as incorrectly interpreted"
              aria-label="Mark incorrect"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inline confirm — replaces the gap so accidental taps are recoverable */}
      {confirming && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-current/20 bg-background/30">
          <span className="text-xs flex-1 opacity-80">
            {isVoice ? 'Remove and tell the recognizer it misheard?' : 'Remove this event?'}
          </span>
          <button
            onClick={() => setConfirming(false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border border-border bg-secondary text-foreground hover:bg-muted btn-tap transition-colors"
          >
            <X className="w-3 h-3" /> Keep
          </button>
          <button
            onClick={() => { onMarkIncorrect(event); setConfirming(false); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 btn-tap transition-colors"
          >
            <Check className="w-3 h-3" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}
