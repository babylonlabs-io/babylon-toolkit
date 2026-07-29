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
