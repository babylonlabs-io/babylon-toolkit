# @babylonlabs-io/babylon-tbv-rust-wasm

WASM bindings for Babylon Trustless Bitcoin Vaults (TBV), providing TypeScript/JavaScript interfaces for creating Bitcoin peg-in transactions.

## Overview

This package provides WebAssembly bindings built from the [vault-wasm](https://github.com/babylonlabs-io/vault-wasm) facade — a single binary bundling every supported [btc-vault](https://github.com/babylonlabs-io/btc-vault) tx-graph version behind version-taking constructors, enabling browser and Node.js applications to construct Bitcoin transactions for TBV.

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
  txGraphVersion: 1, // fresh: activeVaultCoreVersion(); resume: the vault's stamped version
  depositor: 'abc123...', // X-only pubkey (hex)
  vaultProvider: 'def456...', // X-only pubkey (hex)
  vaultKeepers: ['ghi789...'], // Array of vault keeper x-only pubkeys (hex)
  universalChallengers: ['jkl012...'], // Array of universal challenger x-only pubkeys (hex)
  timelockPegin: 50, // CSV timelock in blocks for PegIn output
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

### Assert Payout/NoPayout Connector

The Assert Payout/NoPayout connector generates taproot scripts for the depositor-as-claimer path. It produces payout scripts from Assert output 0 and per-challenger NoPayout scripts.

```typescript
import {
  getAssertPayoutScriptInfo,
  getAssertNoPayoutScriptInfo,
  type AssertPayoutNoPayoutConnectorParams,
} from '@babylonlabs-io/babylon-tbv-rust-wasm';

const params: AssertPayoutNoPayoutConnectorParams = {
  txGraphVersion: 1, // fresh: activeVaultCoreVersion(); resume: the vault's stamped version
  claimer: 'abc123...',            // Depositor acting as claimer, x-only pubkey (hex)
  localChallengers: ['def456...'], // Local challenger x-only pubkeys (hex)
  universalChallengers: ['ghi789...'], // Universal challenger x-only pubkeys (hex)
  timelockAssert: 144,             // CSV timelock in blocks for Assert output
  councilMembers: ['jkl012...'],   // Security council member x-only pubkeys (hex)
  councilQuorum: 3,                // Council quorum (N-of-N)
};

// Payout script from Assert output 0
const payoutInfo = await getAssertPayoutScriptInfo(params);
console.log(payoutInfo.payoutScript);       // Payout script (hex)
console.log(payoutInfo.payoutControlBlock);  // Control block (hex)

// NoPayout script for a specific challenger
const noPayoutInfo = await getAssertNoPayoutScriptInfo(params, 'def456...');
console.log(noPayoutInfo.noPayoutScript);       // NoPayout script (hex)
console.log(noPayoutInfo.noPayoutControlBlock);  // Control block (hex)
```

### ChallengeAssert Connector

The ChallengeAssert connector generates scripts for ChallengeAssert transactions in the depositor-as-claimer path. It uses WOTS public keys and GC WOTS public keys provided by the vault provider.

```typescript
import {
  getChallengeAssertScriptInfo,
  type ChallengeAssertConnectorParams,
} from '@babylonlabs-io/babylon-tbv-rust-wasm';

const params: ChallengeAssertConnectorParams = {
  txGraphVersion: 1, // fresh: activeVaultCoreVersion(); resume: the vault's stamped version
  claimer: 'abc123...',              // Depositor acting as claimer, x-only pubkey (hex)
  challenger: 'def456...',           // Challenger x-only pubkey (hex)
  claimerWotsKeysJson: '[[...]]',     // JSON string of WOTS public keys (blocks 0-1) from VP
  gcWotsKeysJson: '[[...]]',          // JSON string of GC WOTS public keys from VP
};

const scriptInfo = await getChallengeAssertScriptInfo(params);
console.log(scriptInfo.script);       // ChallengeAssert script (hex)
console.log(scriptInfo.controlBlock); // Control block (hex)
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

- **Rust 1.94.1** (via `rustup`) - **Required for reproducible builds**
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
# install and use Rust 1.94.1 when you enter this directory.
# Just cd into the directory and rustup will handle it:
cd packages/babylon-tbv-rust-wasm/
rustc --version  # Will automatically be 1.94.1
```

**How version pinning works:**

This package includes a `rust-toolchain.toml` file that pins Rust to version 1.94.1:

```toml
[toolchain]
channel = "1.94.1"
```

When you `cd` into this directory, rustup automatically:
1. Downloads Rust 1.94.1 if not already installed
2. Switches to use 1.94.1 for all commands in this directory
3. Ensures everyone on the team uses the exact same version

The build script also reports the resolved rustc version and warns on a mismatch; the vault-wasm `rust-toolchain.toml` is what actually selects the build toolchain.

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

#### Rebuilding WASM (only when updating vault-wasm) - Slow 🐌

```bash
pnpm run build-wasm
```

**Build time: slower**

This script:

1. Clones the [vault-wasm repository](https://github.com/babylonlabs-io/vault-wasm)
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
│   ├── payoutConnector.ts    # Payout connector wrapper
│   ├── assertPayoutNoPayoutConnector.ts  # Assert Payout/NoPayout connector
│   └── challengeAssertConnector.ts       # ChallengeAssert connector
├── dist/
│   ├── generated/            # WASM files (pre-built)
│   │   ├── vault_wasm.js
│   │   ├── vault_wasm.d.ts
│   │   ├── vault_wasm_bg.wasm
│   │   └── vault_wasm_bg.wasm.d.ts
│   ├── *.js                  # Compiled TypeScript
│   ├── *.d.ts                # Type declarations
│   └── *.map                 # Source maps
├── scripts/
│   └── build-wasm.js         # Rebuild WASM from vault-wasm
└── package.json
```

**Key points:**

- `src/` contains TypeScript source code
- `dist/generated/` contains pre-built WASM bindings

### Updating the vault-wasm Version

The binary is built from the `vault-wasm` facade repo — a single artifact
bundling every supported btc-vault tx-graph version behind version-taking
constructors. To bump the pin:

1. **Edit configuration** in `scripts/build-wasm.js`:

   ```javascript
   const VAULT_WASM_BRANCH = 'main';
   const VAULT_WASM_COMMIT = '<new-commit-sha>';
   const REQUIRED_RUSTC_VERSION = '1.94'; // vault-wasm rust-toolchain.toml governs the build
   ```

2. **Rebuild WASM** (rustup auto-installs the toolchain from vault-wasm's
   `rust-toolchain.toml`):

   ```bash
   pnpm run build-wasm
   ```

   The build script will:
   - Clone vault-wasm at the specified commit
   - Build the crate root with wasm-pack (web target)
   - Copy generated files to `dist/generated/`

3. **Test the build**:

   ```bash
   pnpm run build
   ```

4. **Run the frozen golden-vector gate** — a pin bump swaps the binary that
   produces the on-chain-binding secrets. The JS golden vectors
   (`babylon-ts-sdk` `vault-secrets/__tests__/expand.test.ts`) and the v1
   tx-parity test (`primitives/psbt/__tests__/pegin.test.ts`) must stay
   byte-identical; any drift is a hard fork and must not ship.

5. **Commit the updated WASM files** to git (force-add — the root
   `.gitignore` excludes `dist`):
   ```bash
   git add scripts/build-wasm.js
   git add -f dist/generated/
   git commit -m "chore: update vault-wasm to <commit-sha>"
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
- ❌ Still nightly-only, not available in stable Rust 1.94.1
- ✅ Will be monitored and adopted when stabilized
- Alternative (Docker) adds complexity without sufficient benefit

**To minimize differences:**
- ✅ All developers use **Rust 1.94.1** (selected by the vault-wasm `rust-toolchain.toml`; the build script warns on mismatch)
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
- `params.txGraphVersion` - Tx graph version selecting the builder (fails closed if unsupported)
- `params.depositor` - Depositor's x-only pubkey (hex)
- `params.vaultProvider` - Vault provider's x-only pubkey (hex)
- `params.vaultKeepers` - Array of vault keeper x-only pubkeys (hex)
- `params.universalChallengers` - Array of universal challenger x-only pubkeys (hex)
- `params.timelockPegin` - CSV timelock in blocks for PegIn output
- `network` - Bitcoin network

**Returns:**
- `payoutScript` - Full payout script (hex)
- `taprootScriptHash` - Taproot script hash / tapLeafHash for PSBT signing
- `scriptPubKey` - Taproot script pubkey (hex)
- `address` - P2TR address
- `payoutControlBlock` - Serialized control block for Taproot script path spend (hex)

#### `getPeginPayoutScriptInfo(params: PayoutConnectorParams): Promise<{ payoutScript: string; payoutControlBlock: string }>`

Returns the payout script and control block from the PeginPayoutConnector without requiring a network parameter. Useful for building payout PSBTs where you need the script and control block for Taproot script path spending.

**Parameters:**
- `params.txGraphVersion` - Tx graph version selecting the builder (fails closed if unsupported)
- `params.depositor` - Depositor's x-only pubkey (hex)
- `params.vaultProvider` - Vault provider's x-only pubkey (hex)
- `params.vaultKeepers` - Array of vault keeper x-only pubkeys (hex)
- `params.universalChallengers` - Array of universal challenger x-only pubkeys (hex)
- `params.timelockPegin` - CSV timelock in blocks for PegIn output

**Returns:**
- `payoutScript` - Payout script hex string
- `payoutControlBlock` - Serialized control block hex string

#### `getAssertPayoutScriptInfo(params: AssertPayoutNoPayoutConnectorParams): Promise<AssertPayoutScriptInfo>`

Generates the Payout script and control block from Assert output 0 for the depositor-as-claimer path.

**Parameters:**
- `params.txGraphVersion` - Tx graph version selecting the builder (fails closed if unsupported)
- `params.claimer` - Claimer (depositor) x-only pubkey (hex)
- `params.localChallengers` - Array of local challenger x-only pubkeys (hex)
- `params.universalChallengers` - Array of universal challenger x-only pubkeys (hex)
- `params.timelockAssert` - CSV timelock in blocks for Assert output
- `params.councilMembers` - Array of security council member x-only pubkeys (hex)
- `params.councilQuorum` - Council quorum (N-of-N)

**Returns:**
- `payoutScript` - Payout script (hex)
- `payoutControlBlock` - Control block for the payout script (hex)

#### `getAssertNoPayoutScriptInfo(params: AssertPayoutNoPayoutConnectorParams, challengerPubkey: string): Promise<AssertNoPayoutScriptInfo>`

Generates the NoPayout script and control block for a specific challenger. Each challenger has a distinct NoPayout script.

**Parameters:**
- `params` - Same as `getAssertPayoutScriptInfo`
- `challengerPubkey` - The challenger's x-only pubkey (hex)

**Returns:**
- `noPayoutScript` - NoPayout script (hex)
- `noPayoutControlBlock` - Control block for the NoPayout script (hex)

#### `getChallengeAssertScriptInfo(params: ChallengeAssertConnectorParams): Promise<ChallengeAssertScriptInfo>`

Generates the ChallengeAssert script and control block for a specific challenger. Uses WOTS public keys and GC WOTS public keys from the vault provider.

**Parameters:**
- `params.txGraphVersion` - Tx graph version selecting the builder (fails closed if unsupported)
- `params.claimer` - Claimer (depositor) x-only pubkey (hex)
- `params.challenger` - Challenger x-only pubkey (hex)
- `params.claimerWotsKeysJson` - JSON string of WOTS public keys (blocks 0-1) from VP
- `params.gcWotsKeysJson` - JSON string of GC WOTS public keys from VP

**Returns:**
- `script` - ChallengeAssert script (hex)
- `controlBlock` - Control block for the ChallengeAssert script (hex)

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
- `WasmAssertPayoutNoPayoutConnector` - Low-level Assert Payout/NoPayout connector class
- `WasmAssertChallengeAssertConnector` - Low-level ChallengeAssert connector class
