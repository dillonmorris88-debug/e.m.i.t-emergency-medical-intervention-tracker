import { MEDICATIONS } from '@/lib/eventData';
import { Pill } from 'lucide-react';

export default function MedicationPanel({ onEvent }) {
  return (
    <div className="slide-up">
      <div className="flex items-center gap-2 mb-3">
        <Pill className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold text-amber-300 tracking-wide uppercase">Medications</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MEDICATIONS.map(item => (
          <button
            key={item.key}
            onClick={() => onEvent(item.label, 'medication')}
            className="py-3 px-3 rounded-xl text-sm font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/25 hover:border-amber-400 btn-tap transition-all text-left"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}