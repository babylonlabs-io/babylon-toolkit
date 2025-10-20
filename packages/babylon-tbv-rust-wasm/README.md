# @babylonlabs-io/babylon-tbv-rust-wasm

WASM bindings for Babylon Trustless Bitcoin Vaults (TBV), providing TypeScript/JavaScript interfaces for creating Bitcoin peg-in transactions.

## Overview

This package provides WebAssembly bindings to the [btc-vault](https://github.com/babylonlabs-io/btc-vault) Rust library, enabling browser and Node.js applications to construct Bitcoin transactions for TBV.

## Installation

```bash
pnpm add @babylonlabs-io/babylon-tbv-rust-wasm
```

## Usage

```typescript
import {
  createPegInTransaction,
  type PegInParams,
} from '@babylonlabs-io/babylon-tbv-rust-wasm';

const params: PegInParams = {
  depositTxid: 'abc123...',
  depositVout: 0,
  depositValue: 100000n,
  depositScriptPubKey: '76a914...',
  depositorPubkey: '02abc...',
  claimerPubkey: '03def...',
  challengerPubkeys: ['04ghi...'],
  pegInAmount: 95000n,
  fee: 5000n,
  network: 'testnet',
};

const result = await createPegInTransaction(params);
console.log(result.txHex); // Transaction hex
console.log(result.txid); // Transaction ID
```

## Development

### Prerequisites

**For normal development (building TypeScript):**

- Node.js >= 24
- pnpm >= 10

**For updating WASM bindings (rare):**

- Rust toolchain (`rustup`)
- `wasm-pack`
- `LLVM` (for `secp256k1` compilation)

On macOS with Homebrew:

```bash
brew install llvm
cargo install wasm-pack
```

### Building

#### Regular Build (TypeScript only) - Fast ⚡

```bash
pnpm run build
```

**Build time: very fast**

This compiles the TypeScript wrapper (`src/index.ts` → `dist/index.js`).
The WASM files are already pre-built and checked into git at `dist/generated/`.

**Use this for:**

- Normal development
- Making changes to TypeScript code
- CI/CD pipelines
- Publishing the package

#### Rebuilding WASM (only when updating btc-vault) - Slow 🐌

```bash
pnpm run build-wasm
```

**Build time: slower**

This script:

1. Clones the [btc-vault repository](https://github.com/babylonlabs-io/btc-vault)
2. Checks out a specific commit on a branch
3. Builds the `Rust` code to `WebAssembly` using `wasm-pack`
4. Outputs generated files to `dist/generated/`

**You only need to run `build-wasm` when:**

- Updating to a new `btc-vault` `commit/tag/release`
- The WASM bindings API changes in `btc-vault`

### Project Structure

```
packages/babylon-tbv-rust-wasm/
├── src/
│   └── index.ts              # TypeScript wrapper API (source code)
├── dist/
│   ├── generated/            # WASM files
│   │   ├── btc_vault.js
│   │   ├── btc_vault.d.ts
│   │   ├── btc_vault_bg.wasm
│   │   └── btc_vault_bg.wasm.d.ts
│   ├── index.js              # Compiled TypeScript
│   ├── index.d.ts            # Type declarations
│   └── *.map                 # Source maps
├── scripts/
│   └── build-wasm.js         # Rebuild WASM from btc-vault
└── package.json
```

**Key points:**

- Only `src/index.ts` is actual source code
- `dist/generated/` contains pre-built WASM

### Updating btc-vault Version

When `btc-vault` releases a new version or you want to update the WASM bindings:

1. **Edit configuration** in `scripts/build-wasm.js`:

   ```javascript
   const BTC_VAULT_BRANCH = 'main'; // or "feat/branch-name"
   const BTC_VAULT_COMMIT = '<new-commit-sha>';
   ```

2. **Rebuild WASM**:

   ```bash
   pnpm run build-wasm
   ```

3. **Test the build**:

   ```bash
   pnpm run build
   ```

4. **Commit the updated WASM files** to git:
   ```bash
   git add dist/generated/
   git commit -m "chore: update btc-vault WASM to <commit-sha>"
   ```
