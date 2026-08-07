import "@testing-library/jest-dom";

// jsdom has no ResizeObserver; charts measure their container with one via
// @visx/responsive. The stub never fires, so components render from their
// deterministic fallback width (see FALLBACK_CHART_WIDTH_PX in charts/
// chartLayout.ts), which is exactly what layout assertions in chart tests
// rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom implements no PointerEvent, so @testing-library falls back to a plain
// Event and silently drops clientX/clientY — every pointer-driven interaction
// would read NaN coordinates. MouseEvent carries them and is what React's
// synthetic pointer events read.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }

  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

// jsdom has no canvas backend either; without this stub `measureText` returns
// 0, truncation becomes the identity function, and every pill collapses to
// its padding — the declutter/truncation geometry would go untested in
// component tests. A fixed per-character advance keeps assertions exact.
const TEST_CHAR_WIDTH_PX = 7;
HTMLCanvasElement.prototype.getContext = function getContext() {
  return {
    font: "",
    measureText: (text: string) => ({ width: text.length * TEST_CHAR_WIDTH_PX }),
  } as unknown as CanvasRenderingContext2D;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;
