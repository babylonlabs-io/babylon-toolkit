# @babylonlabs-io/babylon-tbv-rust-wasm

WASM bindings for Babylon Trustless Bitcoin Vaults (TBV), providing TypeScript/JavaScript interfaces for creating Bitcoin peg-in transactions.

## Overview

This package provides WebAssembly bindings to the [btc-vault](https://github.com/babylonlabs-io/btc-vault) Rust library, enabling browser and Node.js applications to construct Bitcoin transactions for TBV.

## Installation

```bash
pnpm add @babylonlabs-io/babylon-tbv-rust-wasm
```

## Usage

### Creating a Peg-In Transaction

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

### Creating a Payout Connector

The payout connector generates taproot scripts needed for signing payout transactions (both optimistic and regular payout paths).

```typescript
import {
  createPayoutConnector,
  TAP_INTERNAL_KEY,
  type PayoutConnectorParams,
} from '@babylonlabs-io/babylon-tbv-rust-wasm';

const params: PayoutConnectorParams = {
  depositor: 'abc123...', // X-only pubkey (hex)
  vaultProvider: 'def456...', // X-only pubkey (hex)
  vaultKeepers: ['ghi789...'], // Array of vault keeper x-only pubkeys (hex)
  universalChallengers: ['jkl012...'], // Array of universal challenger x-only pubkeys (hex)
};

const payoutInfo = await createPayoutConnector(params, 'testnet');

// Use taprootScriptHash for PSBT signing (this is the tapLeafHash)
console.log(payoutInfo.taprootScriptHash);

// Use tapInternalKey constant for PSBT signing
console.log(TAP_INTERNAL_KEY); // "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"

// Other available fields:
console.log(payoutInfo.payoutScript); // Full payout script (hex)
console.log(payoutInfo.scriptPubKey); // Taproot script pubkey (hex)
console.log(payoutInfo.address); // P2TR address
```

### Constants

The package exports the taproot internal key constant used for vault transactions:

```typescript
import { TAP_INTERNAL_KEY, tapInternalPubkey } from '@babylonlabs-io/babylon-tbv-rust-wasm';

// As hex string
console.log(TAP_INTERNAL_KEY);
// "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"

// As Buffer
console.log(tapInternalPubkey);
// Buffer containing the x-only pubkey
```

## Development

### Prerequisites

**For normal development (building TypeScript):**

- Node.js >= 24
- pnpm >= 10

**For updating WASM bindings (rare):**

- **Rust 1.92.0** (via `rustup`) - **Required for reproducible builds**
- `wasm-pack` >= 0.13.1
- `LLVM` (for `secp256k1` compilation)

On macOS with Homebrew:

```bash
# Install Rust via rustup (not Homebrew)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm32 target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack

# Install LLVM
brew install llvm

# The rust-toolchain.toml file in this directory will automatically
# install and use Rust 1.92.0 when you enter this directory.
# Just cd into the directory and rustup will handle it:
cd packages/babylon-tbv-rust-wasm/
rustc --version  # Will automatically be 1.92.0
```

**How version pinning works:**

This package includes a `rust-toolchain.toml` file that pins Rust to version 1.92.0:

```toml
[toolchain]
channel = "1.92.0"
```

When you `cd` into this directory, rustup automatically:
1. Downloads Rust 1.92.0 if not already installed
2. Switches to use 1.92.0 for all commands in this directory
3. Ensures everyone on the team uses the exact same version

The build script also enforces this version with a runtime check, failing early if wrong version is detected.

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
│   ├── index.ts              # Main entry point
│   ├── types.ts              # TypeScript type definitions
│   ├── constants.ts          # Taproot constants
│   └── payoutConnector.ts    # Payout connector wrapper
├── dist/
│   ├── generated/            # WASM files (pre-built)
│   │   ├── btc_vault.js
│   │   ├── btc_vault.d.ts
│   │   ├── btc_vault_bg.wasm
│   │   └── btc_vault_bg.wasm.d.ts
│   ├── *.js                  # Compiled TypeScript
│   ├── *.d.ts                # Type declarations
│   └── *.map                 # Source maps
├── scripts/
│   └── build-wasm.js         # Rebuild WASM from btc-vault
└── package.json
```

**Key points:**

- `src/` contains TypeScript source code
- `dist/generated/` contains pre-built WASM bindings

### Updating btc-vault Version

When `btc-vault` releases a new version or you want to update the WASM bindings:

1. **Ensure you have Rust 1.92.0**:

   ```bash
   rustc --version
   # Should output: rustc 1.92.0 (ded5c06cf 2025-12-08)

   # If not, update:
   rustup update stable
   ```

2. **Edit configuration** in `scripts/build-wasm.js`:

   ```javascript
   const BTC_VAULT_BRANCH = 'main'; // or "feat/branch-name"
   const BTC_VAULT_COMMIT = '<new-commit-sha>';
   const REQUIRED_RUSTC_VERSION = '1.92.0'; // Update if needed
   ```

3. **Rebuild WASM**:

   ```bash
   pnpm run build-wasm
   ```

   The build script will:
   - Verify your Rust version matches `REQUIRED_RUSTC_VERSION`
   - Clone btc-vault at the specified commit
   - Build WASM bindings
   - Copy generated files to `dist/generated/`

4. **Test the build**:

   ```bash
   pnpm run build
   ```

5. **Commit the updated WASM files** to git:
   ```bash
   git add scripts/build-wasm.js dist/generated/
   git commit -m "chore: update btc-vault WASM to <commit-sha>"
   ```

### Reproducible Builds

**Why WASM binaries may differ between developers:**

The WASM binary includes debug information with file paths, which contain usernames:
- Developer A: `/Users/alice/.cargo/...` (21 chars)
- Developer B: `/Users/bob/.cargo/...` (18 chars)
- 29 embedded paths × 3 byte difference = ~87 byte size difference

This causes ~64-100 byte size differences due to different path lengths. This is **expected and normal** - the binaries are functionally equivalent and work identically.

**Why we can't remove paths (yet):**
- Rust's `trim-paths` feature (RFC 3127) would solve this
- ❌ Still nightly-only, not available in stable Rust 1.92.0
- ✅ Will be monitored and adopted when stabilized
- Alternative (Docker) adds complexity without sufficient benefit

**To minimize differences:**
- ✅ All developers use **Rust 1.92.0** (enforced by `rust-toolchain.toml` + build script)
- ✅ Same `wasm-pack` version
- ✅ Same build flags and optimization levels
- ⏰ When `trim-paths` stabilizes: Add to Cargo.toml profile

**Bottom line:** Small size differences are cosmetic only. Functionality is identical.

## API Reference

### Functions

#### `createPegInTransaction(params: PegInParams): Promise<PegInResult>`

Creates a Bitcoin peg-in transaction for the vault system.

**Parameters:**
- `params.depositTxid` - Transaction ID of the deposit
- `params.depositVout` - Output index of the deposit
- `params.depositValue` - Value in satoshis
- `params.depositScriptPubKey` - Script pubkey (hex)
- `params.depositorPubkey` - Depositor's x-only pubkey (hex)
- `params.claimerPubkey` - Claimer's x-only pubkey (hex)
- `params.challengerPubkeys` - Array of challenger x-only pubkeys (hex)
- `params.pegInAmount` - Amount to peg-in in satoshis
- `params.fee` - Transaction fee in satoshis
- `params.network` - Bitcoin network (`"bitcoin"`, `"testnet"`, `"regtest"`, or `"signet"`)

**Returns:**
- `txHex` - Transaction hex string
- `txid` - Transaction ID
- `vaultScriptPubKey` - Vault script pubkey (hex)
- `vaultValue` - Vault output value in satoshis
- `changeValue` - Change output value in satoshis (0 if no change)

#### `createPayoutConnector(params: PayoutConnectorParams, network: Network): Promise<PayoutConnectorInfo>`

Creates a payout connector for signing payout transactions.

**Parameters:**
- `params.depositor` - Depositor's x-only pubkey (hex)
- `params.vaultProvider` - Vault provider's x-only pubkey (hex)
- `params.vaultKeepers` - Array of vault keeper x-only pubkeys (hex)
- `params.universalChallengers` - Array of universal challenger x-only pubkeys (hex)
- `network` - Bitcoin network

**Returns:**
- `payoutScript` - Full payout script (hex)
- `taprootScriptHash` - Taproot script hash / tapLeafHash for PSBT signing
- `scriptPubKey` - Taproot script pubkey (hex)
- `address` - P2TR address

### Constants

#### `TAP_INTERNAL_KEY: string`

The unspendable taproot internal key used in vault transactions (BIP-341 nothing-up-my-sleeve number).

Value: `"50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"`

#### `tapInternalPubkey: Buffer`

The same as `TAP_INTERNAL_KEY` but as a Buffer for convenience.

### Raw WASM Types

The package also exports raw WASM classes for advanced usage:

- `WasmPeginTx` - Low-level peg-in transaction class
- `WasmPeginPayoutConnector` - Low-level payout connector class
