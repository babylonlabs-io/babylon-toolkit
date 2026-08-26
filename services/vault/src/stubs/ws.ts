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

// Export empty classes to satisfy build-time imports
// These are never executed at runtime in browser environments
export default class WebSocket {}

export const WebSocketServer = class {};
export const Server = class {};
export const Receiver = class {};
export const Sender = class {};
