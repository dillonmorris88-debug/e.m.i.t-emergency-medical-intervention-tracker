import { motion } from 'framer-motion';
import { Check, X, MousePointerClick } from 'lucide-react';

// Phrases a strict procedure still requires, even after teaching (safety).
const STRICT_PHRASE_EXAMPLES = {
  'IV Access':  '"IV access"',
  'IO Access':  '"IO access"',
  'Intubation': '"intubation"',
};

function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

/**
 * "Missed command" teaching flow, shown under the voice indicator.
 *
 * @param {{
 *   options:    Array<{id: string, text: string, command: string, at: number}>,
 *   selectedId: string|null,
 *   learned:    {label: string, phrase: string, wakeVariant: string|null}|null,
 * }} state
 * @param {(id: string) => void} onSelect
 * @param {() => void}           onCancel
 */
export default function MissedCommandBanner({ state, onSelect, onCancel }) {
  const { options, selectedId, learned } = state;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="mx-4 mt-2 rounded-xl border border-primary/50 bg-primary/10 p-3"
    >
      {learned ? (
        <div className="flex items-start gap-2">
          <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Learned {learned.label}</p>
            <p className="text-xs text-muted-foreground truncate">
              "{learned.phrase}" will now log {learned.label}.
            </p>
            {learned.wakeVariant && (
              <p className="text-xs text-muted-foreground">
                "{learned.wakeVariant}" will also wake EMIT.
              </p>
            )}
            {STRICT_PHRASE_EXAMPLES[learned.label] && (
              <p className="text-xs text-amber-300 mt-1">
                For safety, {learned.label} still needs a clear phrase like {STRICT_PHRASE_EXAMPLES[learned.label]}.
              </p>
            )}
          </div>
          <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground btn-tap" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-wider uppercase text-primary">Missed command</span>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground btn-tap"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing was heard in the last 2 minutes. Say the command again, then tap Missed command.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-1.5">What did you say?</p>
              <div className="flex flex-col gap-1.5 mb-2.5" role="radiogroup">
                {options.map((o) => {
                  const selected = o.id === selectedId;
                  return (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onSelect(o.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left btn-tap transition-all ${
                        selected
                          ? 'border-primary bg-primary/20 text-foreground'
                          : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full border shrink-0 ${selected ? 'border-primary bg-primary' : 'border-muted-foreground/50'}`} />
                      <span className="text-xs italic truncate flex-1">"{o.text}"</span>
                      <span className="text-[10px] text-muted-foreground/70 shrink-0">{timeAgo(o.at)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-primary">
                <MousePointerClick className="w-4 h-4 shrink-0 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold">Now tap the button you meant</p>
                  <p className="text-xs text-muted-foreground">It will be logged, and EMIT will learn how you say it.</p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
