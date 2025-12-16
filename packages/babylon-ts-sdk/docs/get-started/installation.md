# Installation & Setup Guide

A quick guide to installing and verifying the Babylon TypeScript SDK.

## System Requirements

- **Node.js** >= 24.0.0
- **Package Manager**: `npm`, `yarn`, or `pnpm`

## Installation

Install the SDK using your preferred package manager:

```bash
# npm
npm install @babylonlabs-io/ts-sdk viem

# yarn
yarn add @babylonlabs-io/ts-sdk viem

# pnpm
pnpm add @babylonlabs-io/ts-sdk viem
```

## Dependencies

The SDK includes these dependencies automatically:

- `@babylonlabs-io/babylon-tbv-rust-wasm` - Core WASM library for Bitcoin vault operations
- `bitcoinjs-lib` - Bitcoin transaction construction
- `@bitcoin-js/tiny-secp256k1-asmjs` - Cryptographic operations
- `buffer` - Node.js Buffer polyfill for browser compatibility
- `viem` - _Peer_ dependency for Ethereum operations

## Verification

Verify the installation works:

```typescript
// verify-install.ts
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

console.log("✅ SDK installed successfully!");
console.log("buildPeginPsbt type:", typeof buildPeginPsbt);
```

Run the verification:

```bash
npx tsx verify-install.ts
```

Expected output:

```
✅ SDK installed successfully!
buildPeginPsbt type: function
```

## Troubleshooting

### "Cannot find module '@babylonlabs-io/ts-sdk/tbv/core/managers'"

**Cause:** TypeScript or bundler doesn't support subpath exports (requires TS 4.7+ or modern bundler).

**Solution:** Use direct imports instead:

```typescript
// Instead of subpath imports
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core/managers";

// Use direct paths
import { PeginManager } from "@babylonlabs-io/ts-sdk/dist/tbv/core/managers/PeginManager";
```

Or upgrade TypeScript: `npm install typescript@latest`

### "Buffer is not defined" (Browser)

**Cause:** Browsers don't have Node.js Buffer API.

**Solution:** Add buffer polyfill:

```bash
npm install buffer
```

Then in your entry file:

```typescript
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;
```

For Vite:

```typescript
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
});
```

### WASM Initialization Errors

**Cause:** WASM module not loaded correctly.

**Solutions:**

**Vite:**

```bash
npm install vite-plugin-wasm
```

```typescript
// vite.config.ts
import wasm from "vite-plugin-wasm";

export default {
  plugins: [wasm()],
};
```

**Webpack:**

```javascript
// webpack.config.js
module.exports = {
  experiments: {
    asyncWebAssembly: true,
  },
};
```

### Module Resolution Errors

**Cause:** Bundler doesn't resolve package.json `exports` field.

**Solution:** Configure bundler to support exports:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

Or use `"moduleResolution": "node16"` in TypeScript 5.x.

## Next Steps

Now that the SDK is installed:

- **[Quickstart Guide](./quickstart.md)** - Build your first peg-in in 5 minutes
- **[Complete Peg-In Flow](../guides/complete-pegin-flow.md)** - Understand the full vault lifecycle
- **[API Reference](../api/managers.md)** - Explore all available methods

## Need Help?

- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [SDK Documentation](../../README.md)
