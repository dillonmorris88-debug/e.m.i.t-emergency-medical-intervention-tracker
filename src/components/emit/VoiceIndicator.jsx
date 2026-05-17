import { Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VoiceIndicator({ active, listening, lastCommand }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        listening
          ? 'bg-green-500/20 border-green-500/50 text-green-300 pulse-green'
          : 'bg-secondary border-border text-muted-foreground'
      }`}>
        {listening ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
        {listening ? 'Listening' : 'Voice Off'}
      </div>
      <AnimatePresence>
        {lastCommand && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-muted-foreground italic truncate max-w-[160px]"
          >
            "{lastCommand}"
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}