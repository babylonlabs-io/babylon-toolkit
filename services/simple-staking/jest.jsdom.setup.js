// Ensure required globals exist before loading MSW
const { TextDecoder, TextEncoder } = require("util");

// Define missing Jest lifecycle functions if not available
const beforeAll = global.beforeAll || ((fn) => fn());
const afterEach = global.afterEach || ((fn) => fn());
const afterAll = global.afterAll || ((fn) => fn());

// Set up TextEncoder/TextDecoder
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

// Mock BroadcastChannel for JSDOM environment
if (typeof global.BroadcastChannel !== "function") {
  global.BroadcastChannel = class BroadcastChannel {
    constructor() {
      this.onmessage = null;
    }
    postMessage() {}
    close() {}
  };
}

// Mock crypto for JSDOM environment
Object.defineProperty(global, "crypto", {
  value: {
    subtle: {},
    getRandomValues: (arr) => {
      return require("crypto").randomFillSync(arr);
    },
  },
});

// Load MSW only after globals are set
const { http, HttpResponse } = require("msw");
const { setupServer } = require("msw/node");

// Define handlers
const handlers = [
  http.get("*", () => {
    return HttpResponse.json({});
  }),
  http.post("*", () => {
    return HttpResponse.json({});
  }),
  http.put("*", () => {
    return HttpResponse.json({});
  }),
  http.delete("*", () => {
    return HttpResponse.json({});
  }),
  http.patch("*", () => {
    return HttpResponse.json({});
  }),
];

// Create MSW server
const server = setupServer(...handlers);

// Export server to allow adding specific handlers in tests
global.mswServer = server;

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Close server after all tests
afterAll(() => server.close());
