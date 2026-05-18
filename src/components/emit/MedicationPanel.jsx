import { Pill } from 'lucide-react';
import { MEDICATIONS } from '@/lib/eventData';
import { useButtonLayout } from '@/hooks/useButtonLayout';
import DraggableButtonGrid from '@/components/emit/DraggableButtonGrid';

export default function MedicationPanel({ onEvent, onBugReport }) {
  const { items, reorder, addItem, removeItem } = useButtonLayout('medications', MEDICATIONS);

  return (
    <div className="slide-up">
      <div className="flex items-center gap-2 mb-3">
        <Pill className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold text-amber-300 tracking-wide uppercase">Medications</span>
      </div>
      <DraggableButtonGrid
        items={items}
        onReorder={reorder}
        onEvent={onEvent}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        category="medications"
        eventCategory="medication"
        buttonClass="border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/25 hover:border-amber-400"
        onBugReport={onBugReport}
      />
    </div>
  );
}