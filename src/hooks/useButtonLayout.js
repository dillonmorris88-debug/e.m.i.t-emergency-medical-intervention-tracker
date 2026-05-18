import { useState, useCallback } from 'react';
import { getCustomButtons } from '@/components/emit/AddCustomButtonModal';

const STORAGE_KEY = 'emit_button_layout';

function getLayouts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveLayouts(layouts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export function useButtonLayout(category, defaultItems) {
  const [items, setItems] = useState(() => {
    const saved = getLayouts()[category];
    const custom = getCustomButtons(category);
    const all = [...defaultItems, ...custom];
    if (!saved) return all;
    const savedKeys = saved.filter(k => all.some(d => d.key === k));
    const newKeys = all.filter(d => !saved.includes(d.key)).map(d => d.key);
    const orderedKeys = [...savedKeys, ...newKeys];
    return orderedKeys.map(k => all.find(d => d.key === k)).filter(Boolean);
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

  const addItem = useCallback((item) => {
    setItems(prev => {
      const next = [...prev, item];
      const layouts = getLayouts();
      layouts[category] = next.map(i => i.key);
      saveLayouts(layouts);
      return next;
    });
  }, [category]);

  const removeItem = useCallback((item) => {
    setItems(prev => {
      const next = prev.filter(i => i.key !== item.key);
      const layouts = getLayouts();
      layouts[category] = next.map(i => i.key);
      saveLayouts(layouts);
      return next;
    });
  }, [category]);

  return { items, reorder, addItem, removeItem };
}