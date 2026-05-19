import { Stethoscope } from 'lucide-react';
import { INTERVENTIONS } from '@/lib/eventData';
import { useButtonLayout } from '@/hooks/useButtonLayout';
import DraggableButtonGrid from '@/components/emit/DraggableButtonGrid';

export default function InterventionPanel({ onEvent, onBugReport, onVoicePause, onVoiceResume }) {
  const { items, reorder, addItem, removeItem } = useButtonLayout('interventions', INTERVENTIONS);

  return (
    <div className="slide-up">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-bold text-blue-300 tracking-wide uppercase">Interventions</span>
      </div>
      <DraggableButtonGrid
        items={items}
        onReorder={reorder}
        onEvent={onEvent}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        category="interventions"
        eventCategory="intervention"
        buttonClass="border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/25 hover:border-blue-400"
        onBugReport={onBugReport}
        onVoicePause={onVoicePause}
        onVoiceResume={onVoiceResume}
      />
    </div>
  );
}