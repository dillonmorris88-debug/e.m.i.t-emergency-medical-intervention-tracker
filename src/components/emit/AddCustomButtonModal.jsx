import { useState } from 'react';
import { X, Plus, Trash2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'emit_custom_buttons';

export function getCustomButtons(category) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return all[category] || [];
  } catch { return []; }
}

function saveCustomButtons(category, buttons) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    all[category] = buttons;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

export default function AddCustomButtonModal({ category, existing, onAdd, onDelete, onClose }) {
  const [label, setLabel] = useState('');

  const handleAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    // prevent duplicates
    if (existing.some(b => b.label.toLowerCase() === trimmed.toLowerCase())) {
      setLabel('');
      return;
    }
    const key = `custom_${Date.now()}`;
    const newBtn = { key, label: trimmed, custom: true };
    const updated = [...getCustomButtons(category), newBtn];
    saveCustomButtons(category, updated);
    onAdd(newBtn);
    setLabel('');
  };

  const handleDelete = (btn) => {
    const updated = getCustomButtons(category).filter(b => b.key !== btn.key);
    saveCustomButtons(category, updated);
    onDelete(btn);
  };

  const customItems = existing.filter(b => b.custom);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-t-3xl p-6 pb-8 slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Add Custom Button</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground btn-tap">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Type a label for your custom {category} button. It will appear in your panel and be loggable like any other button.
        </p>

        {/* Input row */}
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={`e.g. "Glucose Check"`}
            autoFocus
            className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <Button onClick={handleAdd} disabled={!label.trim()} className="shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        {/* Existing custom buttons */}
        {customItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your Custom Buttons</p>
            {customItems.map(btn => (
              <div key={btn.key} className="flex items-center justify-between bg-secondary rounded-xl px-4 py-2.5 border border-border">
                <span className="text-sm text-foreground">{btn.label}</span>
                <button onClick={() => handleDelete(btn)} className="text-muted-foreground hover:text-destructive btn-tap ml-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {customItems.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/50">No custom buttons yet</p>
        )}
      </div>
    </div>
  );
}