import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

// If the user doesn't respond, the command is silently dropped after this delay.
// No action is taken on auto-dismiss — the user must explicitly tap "Yes".
const AUTO_DISMISS_MS = 7000;

/**
 * Full-screen overlay asking the user to confirm a low-confidence or
 * always-confirm voice command before it executes.
 *
 * Safety guarantees:
 *   - Auto-dismisses (rejects) after 7 seconds — no false triggers from silence.
 *   - Tapping outside the card also rejects.
 *   - Confirmation audio for the PREVIOUS command has already finished before
 *     this modal can appear (TTS suppression in speak.js).
 *
 * @param {{ label: string, confidence: number, transcript: string }|null} pending
 * @param {() => void} onConfirm
 * @param {() => void} onReject
 */
export default function VoiceConfirmModal({ pending, onConfirm, onReject }) {
  // Reset the auto-dismiss timer every time a new match arrives.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(onReject, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [pending, onReject]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="voice-confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={onReject}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="w-full max-w-lg bg-card border border-primary/70 rounded-t-3xl p-6 pb-10 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 text-primary">
              <HelpCircle className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-widest">Voice Match</span>
            </div>

            {/* Heard transcript */}
            <p className="text-xs text-muted-foreground mb-1">
              I heard: <span className="font-mono text-foreground/70">"{pending.transcript}"</span>
            </p>

            {/* Matched command */}
            <p className="text-sm text-muted-foreground mb-1">Did you mean:</p>
            <p className="text-3xl font-black text-foreground mb-2">{pending.label}</p>

            <p className="text-xs text-muted-foreground/50 mb-8">
              Confidence: {Math.round((pending.confidence ?? 0) * 100)}%
              &nbsp;·&nbsp;Tap outside or wait {AUTO_DISMISS_MS / 1000} s to cancel
            </p>

            {/* Action buttons — oversized for gloved hands in the field */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={onReject}
                className="flex items-center justify-center gap-2 py-5 rounded-2xl font-bold text-lg border-2 border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/25 active:scale-95 transition-all"
              >
                <XCircle className="w-6 h-6" />
                No
              </button>
              <button
                onClick={onConfirm}
                className="flex items-center justify-center gap-2 py-5 rounded-2xl font-bold text-lg border-2 border-green-500/70 bg-green-500/15 text-green-300 hover:bg-green-500/30 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-6 h-6" />
                Yes — Log it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
