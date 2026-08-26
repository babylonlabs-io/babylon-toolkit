/**
 * Browser stub for Node.js 'ws' package
 *
 * WHY THIS EXISTS:
 * - Wallet libraries (@reown/appkit, @tomo-inc/wallet-connect-sdk) import 'ws' as a transitive dependency
 * - These libraries conditionally use 'ws' only in Node.js/SSR environments
 * - In browsers, they use the native window.WebSocket API instead
 *
 * BUILD TIME vs RUNTIME:
 * - At BUILD TIME: Vite encounters `import ws` in wallet library code and needs this stub to resolve the import
 * - At RUNTIME: This stub is NEVER executed. The wallet libraries detect browser environment and use native WebSocket
 *
 * PRODUCTION IMPACT:
 * - ZERO impact on production functionality
 * - All WebSocket communication uses browser's native WebSocket API
 * - This stub only satisfies the bundler; it's not part of the runtime code path
 */

// Export classes that throw errors if accidentally instantiated
// These should never be executed at runtime in browser environments
export default class WebSocket {
  constructor() {
    throw new Error(
      "ws module stub: WebSocket should not be instantiated in browser. " +
        "Wallet libraries should use native window.WebSocket instead.",
    );
  }
}

export const WebSocketServer = class {
  constructor() {
    throw new Error(
      "ws module stub: WebSocketServer is not available in browser",
    );
  }
};

export const Server = class {
  constructor() {
    throw new Error("ws module stub: Server is not available in browser");
  }
};

export const Receiver = class {
  constructor() {
    throw new Error("ws module stub: Receiver is not available in browser");
  }
};

export const Sender = class {
  constructor() {
    throw new Error("ws module stub: Sender is not available in browser");
  }
};
