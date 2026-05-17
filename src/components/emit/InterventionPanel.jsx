import { INTERVENTIONS } from '@/lib/eventData';
import { Stethoscope } from 'lucide-react';

export default function InterventionPanel({ onEvent }) {
  return (
    <div className="slide-up">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-bold text-blue-300 tracking-wide uppercase">Interventions</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {INTERVENTIONS.map(item => (
          <button
            key={item.key}
            onClick={() => onEvent(item.label, 'intervention')}
            className="py-3 px-3 rounded-xl text-sm font-semibold border border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/25 hover:border-blue-400 btn-tap transition-all text-left"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}