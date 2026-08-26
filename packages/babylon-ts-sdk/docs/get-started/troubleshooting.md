# Troubleshooting & Advanced Setup

Common issues and solutions when integrating the Babylon TypeScript SDK.

## Common Issues

### "Cannot find module" errors

**Cause:** TypeScript or bundler doesn't support subpath exports (requires TS 4.7+ or modern bundler).

**Solution:** Upgrade TypeScript: `npm install typescript@latest`

Or configure TypeScript to use modern module resolution:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

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

- **[Managers Quickstart](../quickstart/managers.md)** - High-level API for wallet integration (recommended for most apps)
- **[Managers API Reference](../api/managers.md)** - Complete type definitions and method signatures
- **[Primitives Quickstart](../quickstart/primitives.md)** - Lower-level API for custom implementations

## Need Help?

- [GitHub Issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- [SDK Documentation](../../README.md)
