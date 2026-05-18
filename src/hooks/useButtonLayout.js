import { useState, useCallback } from 'react';

const STORAGE_KEY = 'emit_button_layout';

function getLayouts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveLayouts(layouts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export function useButtonLayout(category, defaultItems) {
  const [items, setItems] = useState(() => {
    const saved = getLayouts()[category];
    if (!saved) return defaultItems;
    // merge: keep all defaults, apply saved order
    const savedKeys = saved.filter(k => defaultItems.some(d => d.key === k));
    const newKeys = defaultItems.filter(d => !saved.includes(d.key)).map(d => d.key);
    const orderedKeys = [...savedKeys, ...newKeys];
    return orderedKeys.map(k => defaultItems.find(d => d.key === k)).filter(Boolean);
  });

  const reorder = useCallback((fromIndex, toIndex) => {
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const layouts = getLayouts();
      layouts[category] = next.map(i => i.key);
      saveLayouts(layouts);
      return next;
    });
  }, [category]);

  return { items, reorder };
}