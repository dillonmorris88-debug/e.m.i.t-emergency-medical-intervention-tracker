import { useState } from 'react';
import { Mic, MicOff, ChevronDown, Loader2, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getWhisperApiKey } from '@/lib/speechProvider';

const HINT_COMMANDS = [
  { say: '"EMIT epi"',           does: 'Log Epinephrine' },
  { say: '"EMIT CPR"',           does: 'Start CPR' },
  { say: '"EMIT vfib"',          does: 'Mark V-Fib rhythm' },
  { say: '"EMIT defibrillation"',does: 'Log Defibrillation' },
  { say: '"EMIT narcan"',        does: 'Log Narcan' },
  { say: '"EMIT ROSC"',          does: 'Mark ROSC' },
  { say: '"EMIT 12 lead"',       does: 'Log 12-Lead ECG' },
  { say: '"EMIT amio"',          does: 'Log Amiodarone' },
  { say: '"EMIT patient contact"',does: 'Log Patient Contact' },
  { say: '"EMIT discontinue"',   does: 'Confirm Efforts Discontinued' },
];

function getModeName() {
  return getWhisperApiKey() ? 'Whisper API' : 'Offline';
}

/**
 * @param {boolean}   listening
 * @param {string}    lastCommand
 * @param {string}    liveTranscript
 * @param {boolean}   wakeWordDetected
 * @param {() => void} onToggle
 * @param {boolean}   nluProcessing
 * @param {string}    lastMatchedLabel
 * @param {number}    lastConfidence     - 0–1, shown next to last matched label
 * @param {() => void} onOpenTraining    - opens TrainingModeModal
 */
export default function VoiceIndicator({
  listening,
  lastCommand,
  liveTranscript,
  wakeWordDetected,
  onToggle,
  nluProcessing,
  lastMatchedLabel,
  lastConfidence,
  onOpenTraining,
}) {
  const [showHints, setShowHints] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">

        {/* Mic toggle */}
        <button
          onClick={onToggle}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all btn-tap ${
            listening
              ? 'bg-green-500/20 border-green-500/50 text-green-300 pulse-green'
              : 'bg-secondary border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
          }`}
        >
          {listening ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
          {listening ? 'Listening' : 'Voice Off'}
        </button>

        {/* Recognition mode badge — reads from localStorage so it reflects the current key */}
        <span className="text-xs text-muted-foreground/50 font-mono">
          {getModeName()}
        </span>

        {/* NLU processing spinner */}
        <AnimatePresence>
          {nluProcessing && (
            <motion.div
              key="nlu"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-info/20 border border-info/50 text-info text-xs font-semibold"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Interpreting…
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wake word flash */}
        <AnimatePresence>
          {wakeWordDetected && !nluProcessing && (
            <motion.div
              key="wake"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 border border-primary/60 text-primary text-xs font-bold tracking-widest"
            >
              ⚡ EMIT
            </motion.div>
          )}
        </AnimatePresence>

        {/* Last matched label (with confidence %) */}
        <AnimatePresence>
          {lastMatchedLabel && !wakeWordDetected && !nluProcessing && (
            <motion.div
              key={lastMatchedLabel}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-xs font-semibold text-green-400 truncate max-w-[160px]"
            >
              ✓ {lastMatchedLabel}
              {lastConfidence != null && (
                <span className="text-green-400/50 font-normal">
                  {Math.round(lastConfidence * 100)}%
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Raw transcript when no match */}
        <AnimatePresence>
          {lastCommand && !lastMatchedLabel && !wakeWordDetected && !nluProcessing && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground italic truncate max-w-[140px]"
            >
              "{lastCommand}"
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-2">
          {/* Training Mode button */}
          <button
            onClick={onOpenTraining}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary btn-tap transition-colors"
            title="Open Training Mode"
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Train</span>
          </button>

          {/* Command hints toggle */}
          <button
            onClick={() => setShowHints(h => !h)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground btn-tap transition-colors"
            title="Show voice command examples"
          >
            Commands
            <ChevronDown className={`w-3 h-3 transition-transform ${showHints ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Live interim transcript */}
      <AnimatePresence>
        {listening && liveTranscript && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-foreground/80 italic truncate">{liveTranscript}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command hints panel */}
      <AnimatePresence>
        {showHints && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1 p-3 rounded-xl bg-secondary border border-border grid grid-cols-2 gap-x-4 gap-y-1.5">
              <p className="col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Example Commands
              </p>
              {HINT_COMMANDS.map(({ say, does }) => (
                <div key={say} className="flex flex-col">
                  <span className="text-xs text-primary font-mono">{say}</span>
                  <span className="text-xs text-muted-foreground">{does}</span>
                </div>
              ))}
              <p className="col-span-2 text-xs text-muted-foreground/60 mt-1">
                Speak naturally — use Training Mode to teach your accent and phrasing.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
