import "@testing-library/jest-dom";

// jsdom has no ResizeObserver; charts measure their container with one via
// @visx/responsive. The stub never fires, so components render from their
// deterministic fallback width (see FALLBACK_CHART_WIDTH_PX in ChartFrame),
// which is exactly what layout assertions in the chart tests rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

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
