import { useState, useRef } from 'react';
import { GripVertical, BookOpen, PlusCircle, Bug, X } from 'lucide-react';
import { useLongPress } from '@/hooks/useLongPress';
import LearnModal from '@/components/emit/LearnModal';
import AddCustomButtonModal from '@/components/emit/AddCustomButtonModal';

export const TEACH_HIGHLIGHT = 'ring-2 ring-primary ring-offset-2 ring-offset-background';

/**
 * Props:
 *  items        - array of { key, label, custom? }
 *  onReorder    - (fromIndex, toIndex) => void
 *  onEvent      - (label, eventCategory) => void
 *  onAddItem    - (item) => void
 *  onRemoveItem - (item) => void
 *  category     - storage key, e.g. 'interventions' | 'medications'
 *  eventCategory - singular form for event log, e.g. 'intervention' | 'medication'
 *  buttonClass  - tailwind classes for the button
 *  onBugReport  - () => void
 *  highlight    - outline every button (Missed command: "tap the button you meant")
 */
export default function DraggableButtonGrid({ items, onReorder, onEvent, onAddItem, onRemoveItem, category, eventCategory, buttonClass, onBugReport, onVoicePause, onVoiceResume, highlight }) {
  const [editMode, setEditMode] = useState(false);
  const [learnItem, setLearnItem] = useState(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const touchDragRef = useRef({ startY: 0, startX: 0, index: null });

  const longPressHandlers = useLongPress(() => {
    setEditMode(true);
    navigator.vibrate?.(60);
  }, 600);

  // --- Mouse drag ---
  const handleDragStart = (e, index) => {
    if (!editMode) return;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, index) => { e.preventDefault(); setOverIndex(index); };
  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
    setDragIndex(null); setOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setOverIndex(null); };

  // --- Touch drag ---
  const handleTouchStartDrag = (e, index) => {
    if (!editMode) return;
    const t = e.touches[0];
    touchDragRef.current = { startY: t.clientY, startX: t.clientX, index };
    setDragIndex(index);
  };
  const handleTouchMoveDrag = (e) => {
    if (!editMode || dragIndex === null) return;
    e.preventDefault();
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const btn = el?.closest('[data-btn-index]');
    if (btn) setOverIndex(parseInt(btn.getAttribute('data-btn-index')));
  };
  const handleTouchEndDrag = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) onReorder(dragIndex, overIndex);
    setDragIndex(null); setOverIndex(null);
  };

  return (
    <>
      {/* Toolbar — always visible */}
      <div className="flex items-center gap-2 mb-3">
        {editMode ? (
          <>
            <span className="text-xs text-amber-400 font-semibold animate-pulse flex-1">✦ Drag to reorder</span>
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 btn-tap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Custom
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground btn-tap"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground flex-1">Hold button to reorder</span>
            <button
              onClick={onBugReport}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground btn-tap"
              title="Bug Report"
            >
              <Bug className="w-3.5 h-3.5" />
              Bug
            </button>
          </>
        )}
      </div>

      {/* Grid */}
      <div
        className="grid grid-cols-2 gap-2"
        onTouchMove={handleTouchMoveDrag}
        onTouchEnd={handleTouchEndDrag}
      >
        {items.map((item, index) => (
          <div
            key={item.key}
            data-btn-index={index}
            draggable={editMode}
            onDragStart={e => handleDragStart(e, index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onTouchStart={e => { if (editMode) handleTouchStartDrag(e, index); }}
            className={`relative transition-all duration-150 ${overIndex === index && dragIndex !== index ? 'scale-105 opacity-70' : ''} ${dragIndex === index ? 'opacity-40' : ''}`}
          >
            {editMode ? (
              <div className={`${buttonClass} py-3 px-3 rounded-xl text-sm font-semibold border flex items-center justify-between gap-1 select-none cursor-grab active:cursor-grabbing`}>
                <div className="flex items-center gap-1 min-w-0">
                  <GripVertical className="w-4 h-4 shrink-0 opacity-50" />
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); setLearnItem(item); }}
                    className="p-1 rounded-lg bg-primary/20 hover:bg-primary/40 btn-tap"
                    title="Teach voice"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                  </button>
                  {item.custom && (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onRemoveItem(item); }}
                      className="p-1 rounded-lg bg-destructive/20 hover:bg-destructive/40 btn-tap"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                {...longPressHandlers}
                onClick={() => onEvent(item.label, eventCategory || category)}
                className={`w-full ${buttonClass} py-3 px-3 rounded-xl text-sm font-semibold border btn-tap transition-all text-left ${highlight ? TEACH_HIGHLIGHT : ''}`}
              >
                {item.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {learnItem && (
        <LearnModal
          item={learnItem}
          onClose={() => { setLearnItem(null); onVoiceResume?.(); }}
          onOpen={() => onVoicePause?.()}
        />
      )}

      {showAddCustom && (
        <AddCustomButtonModal
          category={category}
          existing={items}
          onAdd={(btn) => { onAddItem(btn); }}
          onDelete={(btn) => { onRemoveItem(btn); }}
          onClose={() => setShowAddCustom(false)}
        />
      )}
    </>
  );
}