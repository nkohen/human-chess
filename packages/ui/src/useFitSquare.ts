import { useEffect, useState } from 'react';
import { fitSquare } from './fit';

/**
 * Hook form of `fitSquare`: measures a DOM element's content box and returns the largest square,
 * in pixels, that fits inside it once `gapPx` is subtracted from each dimension. Returns a
 * callback ref (attach it to the element whose box should be measured) and the current side
 * length, 0 until the first measurement lands.
 *
 * Measurement is a ResizeObserver on the element itself, so it re-fires when the element's own
 * box changes (a sibling column growing or shrinking, the workbench becoming taller under a
 * resized window, ...); a `window` `resize` listener is kept alongside it as a fallback for
 * environments without ResizeObserver, and as a safety net for box changes a ResizeObserver
 * might miss (e.g. a purely CSS-driven reflow that doesn't fire in every browser).
 *
 * Built for Workbench (layouts.tsx) to size its board column, and replaces the memory trainer's
 * own `useAvailableHeight` + `useElementSize` + `squareSize`
 * (subprojects/memory-trainer/src/MemoryTrainer.tsx): those measured a header element and a
 * board area element separately and combined them by hand; here the element passed in is
 * expected to already be sized (by CSS) to the space the board may use, so one measured element
 * is enough.
 */
export function useFitSquare<T extends HTMLElement = HTMLElement>(gapPx = 0): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [side, setSide] = useState(0);

  useEffect(() => {
    if (!node) {
      setSide(0);
      return;
    }

    const measure = (width: number, height: number): void => setSide(fitSquare(width, height, gapPx));
    const measureFromRect = (): void => {
      const rect = node.getBoundingClientRect();
      measure(rect.width, rect.height);
    };

    measureFromRect();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        const box = entries[0]?.contentRect;
        if (box) measure(box.width, box.height);
      });
      observer.observe(node);
    }

    window.addEventListener('resize', measureFromRect);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureFromRect);
    };
  }, [node, gapPx]);

  return [setNode, side];
}
