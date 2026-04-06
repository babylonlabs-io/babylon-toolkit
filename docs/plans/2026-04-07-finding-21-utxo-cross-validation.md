# Finding #21: Pass Selected UTXOs via localPrevouts to Eliminate Mempool Trust

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the trust boundary violation where `signAndBroadcast()` re-fetches UTXO data from the untrusted mempool API, by passing the already-trusted `selectedUTXOs` through the existing `localPrevouts` parameter.

**Architecture:** The `preparePegin()` step already returns `selectedUTXOs` with wallet-sourced UTXO data (txid, vout, value, scriptPubKey). The `signAndBroadcast()` method already accepts `localPrevouts` which bypasses mempool fetches. We convert `selectedUTXOs` into `localPrevouts` format at each call site. Three broadcast paths need fixing: (1) standard deposit flow via `broadcastBtcTransaction`, (2) multi-vault non-split flow via `broadcastPrePeginTransaction`, (3) resume flow via `useVaultActions`. The vault service `broadcastPrePeginTransaction` also needs the same fix — it uses its own PSBT construction that fetches from mempool.

**Tech Stack:** TypeScript, bitcoinjs-lib, vitest

---

## Affected Broadcast Paths

| Path | File | Currently Uses | Fix |
|------|------|----------------|-----|
| Standard deposit | `depositFlowSteps/broadcast.ts` | `broadcastPrePeginTransaction` (mempool fetch) | Pass `selectedUTXOs` → `localPrevouts` |
| Multi-vault non-split | `useMultiVaultDepositFlow.ts:778` | `broadcastPrePeginTransaction` (mempool fetch) | Pass `selectedUTXOs` → `localPrevouts` |
| Resume/retry | `useVaultActions.ts:148` | `broadcastPrePeginTransaction` (mempool fetch) | Read `selectedUTXOs` from localStorage |
| Split pegin | `useMultiVaultDepositFlow.ts:769` | `broadcastPrePeginWithLocalUtxo` (local data) | Already safe — no change needed |

## Key Insight

`vaultPeginBroadcastService.ts` has its own PSBT construction that calls `fetchUTXOFromMempool` directly. Rather than duplicating the `localPrevouts` pattern, the simplest fix is to **add a `selectedUTXOs` parameter** to `BroadcastPrePeginParams` and use it instead of fetching from mempool when available. This mirrors the SDK's `localPrevouts` approach at the service layer.

---

### Task 1: Add `selectedUTXOs` to `BroadcastPrePeginParams` and use them in `addInputsToPsbt`

**Files:**
- Modify: `services/vault/src/services/vault/vaultPeginBroadcastService.ts`

**Step 1: Add `selectedUTXOs` to the params interface**

In `BroadcastPrePeginParams` (line 27), add:
```typescript
export interface BroadcastPrePeginParams {
  unsignedTxHex: string;
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
  depositorBtcPubkey: string;
  /**
   * Pre-validated UTXO data from preparePegin().
   * When provided, used instead of fetching from mempool API.
   * Key format: "txid:vout" → { scriptPubKey, value }
   */
  localPrevouts?: Record<string, { scriptPubKey: string; value: number }>;
}
```

**Step 2: Update `addInputsToPsbt` to accept and use localPrevouts**

Change signature to accept `localPrevouts`:
```typescript
async function addInputsToPsbt(
  psbt: Psbt,
  tx: Transaction,
  publicKeyNoCoord: Buffer,
  localPrevouts?: Record<string, { scriptPubKey: string; value: number }>,
): Promise<void> {
  for (const input of tx.ins) {
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const vout = input.index;

    // Use pre-validated UTXO data when available; fall back to mempool
    const local = localPrevouts?.[`${txid}:${vout}`];
    const utxoData = local ?? (await fetchUTXOFromMempool(txid, vout));

    const psbtInputFields = getPsbtInputFields(
      {
        txid,
        vout,
        value: BigInt(utxoData.value),
        scriptPubKey: utxoData.scriptPubKey,
      },
      publicKeyNoCoord,
    );

    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      ...psbtInputFields,
    });
  }
}
```

Note: The current code passes `utxoData.value` (a `number`) to `getPsbtInputFields` which expects `bigint`. Check the `UTXOInfo` interface — `value` is `bigint` there. The `fetchUTXOFromMempool` returns `number`. Wrap with `BigInt()` to be safe.

**Step 3: Thread `localPrevouts` through `broadcastPrePeginTransaction`**

```typescript
export async function broadcastPrePeginTransaction(
  params: BroadcastPrePeginParams,
): Promise<string> {
  const { unsignedTxHex, btcWalletProvider, depositorBtcPubkey, localPrevouts } = params;
  // ...
  const psbt = await createPsbtFromTransaction(tx, publicKeyNoCoord, localPrevouts);
  // ...
}
```

Update `createPsbtFromTransaction` to pass it through:
```typescript
async function createPsbtFromTransaction(
  tx: Transaction,
  publicKeyNoCoord: Buffer,
  localPrevouts?: Record<string, { scriptPubKey: string; value: number }>,
): Promise<Psbt> {
  // ...
  await addInputsToPsbt(psbt, tx, publicKeyNoCoord, localPrevouts);
  // ...
}
```

**Step 4: Run typecheck**

Run: `cd services/vault && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```
fix(vault): accept localPrevouts in broadcast service to bypass mempool fetch
```

---

### Task 2: Add `selectedUTXOs` to `BroadcastParams` and pass through in deposit flow steps

**Files:**
- Modify: `services/vault/src/hooks/deposit/depositFlowSteps/types.ts`
- Modify: `services/vault/src/hooks/deposit/depositFlowSteps/broadcast.ts`

**Step 1: Add selectedUTXOs to BroadcastParams**

In `types.ts`, `BroadcastParams` (line 185):
```typescript
export interface BroadcastParams {
  btcTxid: string;
  depositorBtcPubkey: string;
  btcWalletProvider: BitcoinWallet;
  /** Funded Pre-PegIn tx hex to broadcast (avoids re-fetching from indexer) */
  fundedPrePeginTxHex: string;
  /** Pre-validated UTXOs from preparePegin() — used instead of mempool fetch */
  selectedUTXOs: DepositUtxo[];
}
```

**Step 2: Convert selectedUTXOs to localPrevouts in broadcast.ts**

In `broadcast.ts`, build the localPrevouts map and pass it:
```typescript
export async function broadcastBtcTransaction(
  params: BroadcastParams,
  depositorEthAddress: Address,
): Promise<string> {
  const {
    btcTxid,
    depositorBtcPubkey,
    btcWalletProvider,
    fundedPrePeginTxHex,
    selectedUTXOs,
  } = params;

  // Convert selectedUTXOs to localPrevouts format for mempool-free broadcast
  const localPrevouts: Record<string, { scriptPubKey: string; value: number }> = {};
  for (const utxo of selectedUTXOs) {
    localPrevouts[`${utxo.txid}:${utxo.vout}`] = {
      scriptPubKey: utxo.scriptPubKey,
      value: utxo.value,
    };
  }

  const broadcastTxId = await broadcastPrePeginTransaction({
    unsignedTxHex: fundedPrePeginTxHex,
    btcWalletProvider: {
      signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
    },
    depositorBtcPubkey,
    localPrevouts,
  });

  updatePendingPeginStatus(
    depositorEthAddress,
    btcTxid,
    LocalStorageStatus.CONFIRMING,
    broadcastTxId,
  );

  return broadcastTxId;
}
```

**Step 3: Run typecheck**

Run: `cd services/vault && npx tsc --noEmit`
Expected: Errors in callers of `broadcastBtcTransaction` — they don't pass `selectedUTXOs` yet. That's Task 3.

**Step 4: Commit**

```
fix(vault): thread selectedUTXOs through broadcast flow step
```

---

### Task 3: Pass `selectedUTXOs` at all broadcast call sites

**Files:**
- Modify: `services/vault/src/hooks/deposit/useDepositFlow.ts` (line 305)
- Modify: `services/vault/src/hooks/deposit/useMultiVaultDepositFlow.ts` (line 778)

**Step 1: Pass selectedUTXOs in useDepositFlow.ts**

At line 305, `broadcastBtcTransaction` call — add `selectedUTXOs`:
```typescript
await broadcastBtcTransaction(
  {
    btcTxid: registration.btcTxid,
    depositorBtcPubkey: prepared.depositorBtcPubkey,
    btcWalletProvider: confirmedBtcWallet,
    fundedPrePeginTxHex: prepared.fundedPrePeginTxHex,
    selectedUTXOs: prepared.selectedUTXOs,
  },
  depositorEthAddress,
);
```

`prepared.selectedUTXOs` is already available (returned from `preparePeginTransaction` at line 236).

**Step 2: Pass localPrevouts in useMultiVaultDepositFlow.ts**

At line 778, `broadcastPrePeginTransaction` call — build and pass `localPrevouts`:
```typescript
// STANDARD: Broadcast with pre-validated UTXOs (no mempool fetch)
const localPrevouts: Record<string, { scriptPubKey: string; value: number }> = {};
for (const utxo of peginResult.selectedUTXOs) {
  localPrevouts[`${utxo.txid}:${utxo.vout}`] = {
    scriptPubKey: utxo.scriptPubKey,
    value: Number(utxo.value),
  };
}

await broadcastPrePeginTransaction({
  unsignedTxHex: result.fundedPrePeginTxHex,
  btcWalletProvider: {
    signPsbt: (psbtHex: string) =>
      confirmedBtcWallet.signPsbt(psbtHex),
  },
  depositorBtcPubkey: result.depositorBtcPubkey,
  localPrevouts,
});
```

Note: `peginResult.selectedUTXOs` has `value: bigint` (from SDK's `UTXO` type). The `localPrevouts` expects `value: number`. Use `Number(utxo.value)` — amounts in sats always fit in `number`.

**Step 3: Run typecheck**

Run: `cd services/vault && npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```
fix(vault): pass selectedUTXOs to broadcast in deposit and multi-vault flows
```

---

### Task 4: Fix resume flow (`useVaultActions`) to use stored `selectedUTXOs`

**Files:**
- Modify: `services/vault/src/hooks/deposit/useVaultActions.ts`

**Step 1: Read selectedUTXOs from localStorage and pass to broadcast**

The `pendingPegin` parameter (passed from the component) has `selectedUTXOs` stored in localStorage. Read it and convert to `localPrevouts`:

At line ~148:
```typescript
// Build localPrevouts from stored selectedUTXOs (avoids untrusted mempool fetch)
const localPrevouts: Record<string, { scriptPubKey: string; value: number }> | undefined =
  pendingPegin?.selectedUTXOs
    ? Object.fromEntries(
        pendingPegin.selectedUTXOs.map((utxo) => [
          `${utxo.txid}:${utxo.vout}`,
          { scriptPubKey: utxo.scriptPubKey, value: Number(utxo.value) },
        ]),
      )
    : undefined;

const txId = await broadcastPrePeginTransaction({
  unsignedTxHex,
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
  },
  depositorBtcPubkey,
  localPrevouts,
});
```

Note: `pendingPegin?.selectedUTXOs` stores value as `string` (for JSON serialization). `Number(utxo.value)` converts it back.

**Step 2: Update the comment at line 147**

Change:
```typescript
// Broadcast the transaction (UTXO will be derived from mempool API)
```
To:
```typescript
// Broadcast with pre-validated UTXOs from localStorage (falls back to mempool if unavailable)
```

**Step 3: Run typecheck**

Run: `cd services/vault && npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```
fix(vault): use stored selectedUTXOs in resume broadcast flow
```

---

### Task 5: Write tests for the localPrevouts bypass in broadcast service

**Files:**
- Create: `services/vault/src/services/vault/__tests__/vaultPeginBroadcastService.test.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: vi.fn().mockResolvedValue("mock-txid"),
}));

vi.mock("../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn().mockReturnValue("https://mempool.test/api"),
}));

vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: vi.fn(),
}));

// getPsbtInputFields needs to return valid PSBT input structure
vi.mock("../../utils/btc", () => ({
  getPsbtInputFields: vi.fn().mockReturnValue({
    witnessUtxo: {
      script: Buffer.from("0014aaaa", "hex"),
      value: 100000,
    },
  }),
}));

import { broadcastPrePeginTransaction } from "../vaultPeginBroadcastService";
import { fetchUTXOFromMempool } from "../vaultUtxoDerivationService";

// Minimal valid SegWit transaction hex with one input and one output
// (We don't need a real tx — the mock wallet handles signing)
const MOCK_TX_HEX =
  "02000000" + // version
  "01" + // input count
  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" + // prev txid (reversed)
  "00000000" + // prev vout
  "00" + // script length
  "ffffffff" + // sequence
  "01" + // output count
  "a086010000000000" + // value (100000 LE)
  "16" + // script length
  "0014aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" + // P2WPKH script
  "00000000"; // locktime

describe("broadcastPrePeginTransaction", () => {
  const depositorBtcPubkey =
    "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  const mockWallet = {
    signPsbt: vi.fn().mockImplementation(async (psbtHex: string) => {
      // Return the same PSBT (tests don't validate actual signatures)
      return psbtHex;
    }),
  };

  it("uses localPrevouts instead of fetching from mempool when provided", async () => {
    const localPrevouts = {
      "9078563412efcdab9078563412efcdab9078563412efcdab9078563412efcdab:0": {
        scriptPubKey: "0014aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: 100000,
      },
    };

    try {
      await broadcastPrePeginTransaction({
        unsignedTxHex: MOCK_TX_HEX,
        btcWalletProvider: mockWallet,
        depositorBtcPubkey,
        localPrevouts,
      });
    } catch {
      // Signing may fail with mock data — that's OK, we're testing the UTXO fetch path
    }

    // The key assertion: mempool was NOT called
    expect(fetchUTXOFromMempool).not.toHaveBeenCalled();
  });

  it("falls back to mempool fetch when localPrevouts not provided", async () => {
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      value: 100000,
    });

    try {
      await broadcastPrePeginTransaction({
        unsignedTxHex: MOCK_TX_HEX,
        btcWalletProvider: mockWallet,
        depositorBtcPubkey,
      });
    } catch {
      // Signing may fail with mock data
    }

    expect(fetchUTXOFromMempool).toHaveBeenCalled();
  });

  it("falls back to mempool fetch for inputs not in localPrevouts", async () => {
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      value: 100000,
    });

    // Provide localPrevouts for a DIFFERENT utxo (not matching the tx input)
    const localPrevouts = {
      "0000000000000000000000000000000000000000000000000000000000000000:99": {
        scriptPubKey: "0014bbbb",
        value: 50000,
      },
    };

    try {
      await broadcastPrePeginTransaction({
        unsignedTxHex: MOCK_TX_HEX,
        btcWalletProvider: mockWallet,
        depositorBtcPubkey,
        localPrevouts,
      });
    } catch {
      // Signing may fail
    }

    // Should fall back to mempool for the unmatched input
    expect(fetchUTXOFromMempool).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests**

Run: `cd services/vault && npx vitest run src/services/vault/__tests__/vaultPeginBroadcastService.test.ts`
Expected: 3 tests pass

**Step 3: Commit**

```
test(vault): add broadcast service tests for localPrevouts bypass
```

---

### Task 6: Update existing tests for new `selectedUTXOs` parameter

**Files:**
- Modify: `services/vault/src/hooks/deposit/__tests__/depositFlowSteps.test.ts`
- Modify: `services/vault/src/hooks/deposit/__tests__/useDepositFlow.test.tsx`
- Modify: `services/vault/src/hooks/deposit/__tests__/useMultiVaultDepositFlow.test.tsx`

**Step 1: Update depositFlowSteps.test.ts**

Find the `broadcastBtcTransaction` test calls and add `selectedUTXOs` to the params. The mock for `broadcastPrePeginTransaction` should verify `localPrevouts` is passed.

**Step 2: Update useDepositFlow.test.tsx**

Ensure the mock `broadcastPrePeginTransaction` receives `localPrevouts`. Check that `prepared.selectedUTXOs` is threaded through.

**Step 3: Update useMultiVaultDepositFlow.test.tsx**

Ensure the non-split broadcast path mock receives `localPrevouts`.

**Step 4: Run all tests**

Run: `cd services/vault && npx vitest run src/hooks/deposit/__tests__/`
Expected: All pass

**Step 5: Commit**

```
test(vault): update deposit flow tests for selectedUTXOs in broadcast
```

---

### Task 7: Final verification — lint, typecheck, full test suite

**Step 1: Typecheck**

Run: `cd services/vault && npx tsc --noEmit`
Expected: Clean

**Step 2: Lint affected files**

Run: `cd services/vault && pnpm exec eslint src/services/vault/vaultPeginBroadcastService.ts src/hooks/deposit/depositFlowSteps/broadcast.ts src/hooks/deposit/depositFlowSteps/types.ts src/hooks/deposit/useDepositFlow.ts src/hooks/deposit/useMultiVaultDepositFlow.ts src/hooks/deposit/useVaultActions.ts`
Expected: No errors

**Step 3: Run full affected test suite**

Run: `cd services/vault && npx vitest run src/services/vault/__tests__/vaultPeginBroadcastService.test.ts src/hooks/deposit/__tests__/`
Expected: All pass

**Step 4: Final commit if any cleanup needed**

---

## Summary of Changes

| File | Change |
|------|--------|
| `vaultPeginBroadcastService.ts` | Add `localPrevouts` param, use before mempool fetch |
| `depositFlowSteps/types.ts` | Add `selectedUTXOs` to `BroadcastParams` |
| `depositFlowSteps/broadcast.ts` | Convert `selectedUTXOs` → `localPrevouts`, pass to broadcast |
| `useDepositFlow.ts` | Pass `prepared.selectedUTXOs` to broadcast call |
| `useMultiVaultDepositFlow.ts` | Build `localPrevouts` from `peginResult.selectedUTXOs` |
| `useVaultActions.ts` | Read `selectedUTXOs` from localStorage, build `localPrevouts` |
| `vaultPeginBroadcastService.test.ts` | New: test localPrevouts bypass |
| Existing test files | Update mocks for new params |

## What's NOT Changed

- **SDK `PeginManager.signAndBroadcast()`** — Already supports `localPrevouts`. No SDK change needed.
- **Split pegin flow** — Already uses local UTXO data. Not affected.
- **`fetchUTXOFromMempool`** — Still exists as fallback. Not removed.
