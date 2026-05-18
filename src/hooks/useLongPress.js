import { useRef, useCallback } from 'react';

export function useLongPress(onLongPress, delay = 600) {
  const timerRef = useRef(null);
  const movedRef = useRef(false);

  const start = useCallback((e) => {
    movedRef.current = false;
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  const move = useCallback(() => {
    movedRef.current = true;
    clearTimeout(timerRef.current);
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseMove: move,
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: move,
  };
}