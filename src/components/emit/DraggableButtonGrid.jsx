import { useState, useRef } from 'react';
import { GripVertical, BookOpen } from 'lucide-react';
import { useLongPress } from '@/hooks/useLongPress';
import LearnModal from '@/components/emit/LearnModal';

/**
 * Props:
 *  items        - array of { key, label }
 *  onReorder    - (fromIndex, toIndex) => void
 *  onEvent      - (label, category) => void
 *  category     - 'intervention' | 'medication'
 *  buttonClass  - tailwind classes for the button
 */
export default function DraggableButtonGrid({ items, onReorder, onEvent, category, buttonClass }) {
  const [editMode, setEditMode] = useState(false);
  const [learnItem, setLearnItem] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const touchDragRef = useRef({ startY: 0, startX: 0, index: null });

  // Long press on any button enters edit mode
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

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

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
    if (btn) {
      const idx = parseInt(btn.getAttribute('data-btn-index'));
      setOverIndex(idx);
    }
  };

  const handleTouchEndDrag = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      onReorder(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <>
      {/* Edit mode bar */}
      {editMode && (
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs text-amber-400 font-semibold animate-pulse">✦ Drag to reorder</span>
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(false)}
              className="text-xs px-3 py-1 rounded-lg bg-secondary border border-border text-foreground btn-tap"
            >
              Done
            </button>
          </div>
        </div>
      )}

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
            onTouchStart={e => {
              if (editMode) handleTouchStartDrag(e, index);
            }}
            className={`relative transition-all duration-150 ${
              overIndex === index && dragIndex !== index ? 'scale-105 opacity-70' : ''
            } ${dragIndex === index ? 'opacity-40' : ''}`}
          >
            {editMode ? (
              /* Edit mode: show grab handle + learn button */
              <div className={`${buttonClass} py-3 px-3 rounded-xl text-sm font-semibold border flex items-center justify-between gap-1 select-none cursor-grab active:cursor-grabbing`}>
                <div className="flex items-center gap-1 min-w-0">
                  <GripVertical className="w-4 h-4 shrink-0 opacity-50" />
                  <span className="truncate">{item.label}</span>
                </div>
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); setLearnItem(item); }}
                  className="shrink-0 p-1 rounded-lg bg-primary/20 hover:bg-primary/40 btn-tap"
                  title="Teach voice"
                >
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                </button>
              </div>
            ) : (
              /* Normal mode: long-pressable action button */
              <button
                {...longPressHandlers}
                onClick={() => onEvent(item.label, category)}
                className={`w-full ${buttonClass} py-3 px-3 rounded-xl text-sm font-semibold border btn-tap transition-all text-left`}
              >
                {item.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {learnItem && (
        <LearnModal item={learnItem} onClose={() => setLearnItem(null)} />
      )}
    </>
  );
}