# Ledger depositor-as-claimer: devnet test driver

This is a test harness for #2607 (`feat/2111-delegated-claim-signing-plan`). It is for testing only and must never be merged. It lets you claim your own vault from a Ledger when the vault provider (VP) is gone. #2607 ships the SDK and the Ledger client but no UI, and the page and scripts here fill that gap.

What you get:

- a dev-only page at `/dev/claim-ledger` (`services/vault/src/dev/DelegatedClaimLedgerDriver.tsx`), which runs the SDK flow against a connected Ledger;
- Node scripts in this folder, which handle the 1.4 GB VP artifacts file that the browser cannot load.

## How this relates to `harness/2111-full`

The harness #2607 mentions ("the browser page that drives them on devnet lives on a never-merged branch") is on the remote as `harness/2111-full`. It is built on an older version of #2607's SDK commit (`223515ac4`, 22 Sep), not on the current head (`27b8855b9`). Since then the delegated-claim, deposit-terms and Ledger provider code has changed by about 2,500 lines across 33 files, including the required trusted verifying key (`verifyingKeyBinding.ts`). The harness calls `planDelegatedClaimSigning` without `trustedVerifyingKeyHex` (`claimSteps.ts:60-69`), which the current SDK requires, so it does not compile against the current SDK. A run on the harness exercises the 22 Sep code, not the code under review.

This driver is built on the current #2607 head. It uses the same approach (`LedgerVaultProvider` connected directly, chain reads, placeholder BaBe sessions plus a join script, resumable signing), with two differences:

- It signs from the VP artifacts downloaded **during the deposit**. The harness downloads the bundle from the VP as a claim step, which a VP that is off cannot serve.
- The claim-time steps (broadcast Claim, pin the proof, finalize and broadcast Assert, broadcast Payout) are ported from the harness's steps 8–11 onto the current SDK, in the page's "Claim on Bitcoin" panel (step 8b). The watchtower (`vaultd vp wt`) remains an alternative (step 8).

## How the flow works

1. The claim is enabled by the depositor's `VaultClaimableBy` event on the registry. `withdrawCollaterals` (Withdraw in the dApp) emits it. The SDK refuses any vault that is not Redeemed and has no such event at a **finalized** block.
2. The same withdraw also emits the VP's event. A running VP immediately runs its own claim, and both Payouts spend PegIn:0, so yours becomes unusable. **The VP must be off before you withdraw, and must stay off until your Payout confirms.**
3. The VP serves the claim graph (`vaultProvider_requestDepositorClaimerArtifacts`) only while the vault is PendingActivation or Activated. So you download the artifacts from the dApp **during the deposit**, while the VP is up.
4. The Ledger signs 52 transactions on devnet: Claim, Assert, the depositor Payout, the claimer Payout, and 48 WronglyChallenged (8 challengers × 6 garbled-circuit instances). Every one is reviewed and approved on the device.
5. The page writes `artifacts.json` with placeholder BaBe sessions. `join-babe-sessions.mjs` splices the real ones in. The watchtower (`vaultd vp wt`) then broadcasts Claim and Assert, and later the Payout.

## Prerequisites

- A checkout of this branch. Build the packages (`pnpm install && pnpm run build`), then check that `packages/*/dist` exists for ts-sdk, wallet-connector, ledger-vault-signer and core-ui. If your shell sets `NX_WORKSPACE_ROOT_PATH`, Nx builds the checkout that variable points to, not this one. Build each package with `pnpm --filter <package> run build` instead.
- `services/vault/.env` and `.env.local` pointing at devnet: `NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY`, `NEXT_PUBLIC_ETH_RPC_URL`, `NEXT_PUBLIC_BTC_NETWORK=signet`, `NEXT_PUBLIC_MEMPOOL_API`, `NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET=true`. The scripts read the same files.
- A Ledger running Babylon Vault app **0.10.1 or later**, with auto-lock and the screensaver off. The signing takes several minutes of clicking.
- Chrome, Edge or Brave. The Ledger connection uses WebHID.
- A VP you can turn off and on. Coordinate with its operator.

## Steps

### 1. Deposit (VP on)

1. In the dApp, deposit with the Ledger through the test VP, and take it through activation. Make **two** vaults, so you keep a spare.
2. For each vault, download the recovery artifacts from the deposit screen. The file is about 1.4 GB and is named `babylon-vault-artifacts-<first 8 hex of the PegIn txid>.json`. Keep these files **outside the repo**, or at least never stage them.
3. **Do not withdraw yet.**

### 2. Prepare the files (no device needed)

Run from `services/vault`:

```bash
# The filename carries the PegIn txid; every claim step needs the vault id.
node scripts/dev-claim/find-vault-id.mjs <first 8+ hex of the PegIn txid>

# Cut the 1.4 GB file down to the graph + served verifying key (~1.8 MB).
node scripts/dev-claim/slim-vp-artifacts.mjs /abs/babylon-vault-artifacts-XXXXXXXX.json /abs/vault.slim.json

# Everything up to the Ledger, with no wallet: chain read (dry-run shim), deposit-terms rebuild, the 52-request plan.
node scripts/dev-claim/dry-plan.mjs --vault 0x<vaultId> --slim /abs/vault.slim.json
```

`dry-plan.mjs` must end with `OK — everything up to the Ledger ceremony checks out.` before you touch the device.

### 3. Get the trusted verifying key

The SDK refuses a Groth16 verifying key served by the VP unless the caller supplies the same key from a trusted source. For this vault, the trusted key comes from the prover (`prover_computeVk` with the vault id, the depositor's x-only key and the vault's prover circuit version; `dry-plan.mjs` prints the version). Ask the prover operator for the exact request.

If you leave the field empty, the page uses the VP-served key, logs that it did, and records `vkSource: "vp-served (TEST ONLY)"` in the handoff file. The run still works, but the trusted-key check becomes vacuous.

### 4. Dry run on the device (VP off, vault still Active)

1. Turn the VP off.
2. `pnpm --filter vault run dev`, then open `http://localhost:5173/dev/claim-ledger`.
3. Connect **Ledger Vault** for BTC with the dApp's normal Connect button.
4. Enter the vault id, pick the `.slim.json`, and paste the trusted key if you have it. Leave **Dry run** ticked; the red banner shows.
5. Click **Preflight**. It checks the `finalized` block tag, a 7,200-block `eth_getLogs`, and the vault's status (2 = Active).
6. Click **Run** and approve on the device, in this order:
   1. a derivation for the claimer WOTS keypair (the browser downloads `wots_keypair.<id>.json`; this file is secret);
   2. a derivation plus the deposit-terms approval screens;
   3. Assert and the depositor Payout;
   4. a derivation that releases the intent;
   5. the claimer Payout, Claim, then 48 × "Review wrongly challenged TX".
7. Success ends with `all 52 signatures collected and verified`, a WASM signature check that passes, and `DRY RUN complete`. The dry-run artifacts are not usable, because their event block is 0.

In dry run the page shims the registry reads: the vault is read as Redeemed, with a synthetic block-0 `VaultClaimableBy` event. The PSBTs don't depend on the event block, so the signatures carry over to the real run.

**If it stops partway**, the collected signatures stay in the browser's localStorage, keyed by vault id. **Download saved signatures** gives you a backup. Fix the cause, reconnect, and click Run again. Standalone signatures are reused. Assert and the depositor Payout are always re-signed, because they need the intent loaded again.

### 5. Withdraw (VP still off)

1. In the dApp, withdraw **one** vault. Keep the other as a spare.
2. Click **Preflight** until the status is 3 (Redeemed) and the finalized block is past your withdraw block. That takes about 15–20 minutes.

### 6. Real run

1. Untick **Dry run** and click **Run**. Most signatures are reused, so there are only a handful of prompts.
2. Three files download: `artifacts.placeholder.<id>.json`, `wots_keypair.<id>.json` and `handoff.<id>.json`.
3. `assertArtifactsUsableForVault` refusing because of the placeholder sessions is expected at this stage.

### 7. Join the real BaBe sessions

```bash
node scripts/dev-claim/join-babe-sessions.mjs \
  --artifacts /abs/artifacts.placeholder.<id>.json \
  --vp /abs/babylon-vault-artifacts-XXXXXXXX.json \
  --slim /abs/vault.slim.json \
  --vault 0x<vaultId> \
  --out /abs/artifacts.json
```

The script refuses when:

- the VP file changed since slimming;
- the vault id, graph or challenger set don't match;
- any session is not the placeholder;
- the file is a dry-run file (block 0).

It writes a file of about 1.4 GB and prints its sha256.

### 8. Watchtower (VP still off)

Hand `artifacts.json`, `wots_keypair.<id>.json` and `handoff.<id>.json` to whoever runs the watchtower. `peginTxid` in the handoff is `--pegin-id`. The commands are from btc-vault `docs/operations/delegated_claim.md` @ `82a660c3`:

```bash
vaultd vp wt start-claim --pegin-id <peginTxid> --artifacts-file artifacts.json \
  --wots-keypair-file wots_keypair.json --config watchtower.toml --output ./tx_output [--broadcast]
# after the Assert timelock:
vaultd vp wt finalize-payout --artifacts-file artifacts.json --config watchtower.toml --output ./tx_output [--broadcast]
```

Run once without `--broadcast` first. The test passes when Claim, Assert and Payout confirm, and the Payout pays the depositor's registered script.

### 8b. Or: finish from the browser, without `vaultd`

The "Claim on Bitcoin" panel under the page's log drives the SDK's claim-time functions (`pinPegoutProof`, `attachFinalizedAssert`, `finalizePayout`) and broadcasts through the mempool API. It works on the placeholder-session file from the real run; Claim, Assert and Payout never read the BaBe sessions.

1. Load the real run's `artifacts.placeholder.<id>.json`, `wots_keypair.<id>.json` and `handoff.<id>.json`.
2. **Broadcast Claim.**
3. Enter the prover's JSON-RPC URL and click **Show prover curl commands**. The prover sends no CORS headers, so run the two commands from a terminal: `prover_submitClaimEvent` returns a `jobId`; poll `prover_getProof` with it until `jobStatus` is `complete`. The request shape follows `vault-provers` `service/crates/prover-service-primitives/src/rpc.rs` @ `internal-audit-2026-08-26`, the tag btc-vault pins. `preset` is `mainnet` for Sepolia (btc-vault `docs/operations/vaultd.md`, `[prover].network_preset`).
4. Paste the whole `getProof` reply and click **Pin proof**. The page checks that the proof's vault and claimer match the handoff, and the WASM verifies the proof under the file's verifying key. The pinned file downloads: from here on, only continue from that file, because the WOTS key signs exactly one proof.
5. **Finalize Assert** (downloads the asserted file), then **Broadcast Assert**.
6. After `timelockAssert` blocks (102 on devnet, offchain params version 3), click **Broadcast Payout**. To resume after a reload, load the asserted file.

This path does not watch for a `ChallengeAssert`. Answering one inside `timelockChallengeAssert` (36 blocks on devnet) needs the real BaBe sessions (the joined file) and `vaultd vp wt broadcast-wrongly-challenged`.

## Notes from the first run

- On devnet (2026-09-28), with a Ledger on Babylon Vault 0.10.1, all 52 signatures completed and verified. The vault was withdrawn with the VP off, and Claim and Assert were broadcast from the browser panel. The devnet prover returned the proof in about 1.5 minutes, and `pinPegoutProof` accepted the placeholder-session file. Both transactions relayed through mempool.space signet without fee bumping (about 2–2.6 sat/vB).
- The device shows a full review for each of the 48 WronglyChallenged transactions. Expect about 56 approvals per vault in total.
- Three runs stopped partway through the WronglyChallenged reviews with `DeviceDisconnectedWhileSendingError`, and the Babylon Vault app exited to the dashboard. A different transaction failed each time, and one that failed signed fine on resume. A host-side and a firmware-side review found no bug on the WronglyChallenged path: no per-session state, no caps, a 73-byte leaf. The two app-exit paths that fit are:
  - the app's home screen, which has "Quit app" and appears between reviews after the "Transaction signed" status;
  - the firmware's roughly 5-second timeout when the host stalls mid-command, for example in a background tab.

  The last run completed all 38 remaining signatures with the tab in the foreground and the device left untouched between reviews.
- To trace device traffic, run `globalThis.__LEDGER_VAULT_APDU_TRACE__ = true` in the DevTools console and enable console timestamps. The page logs the full error cause chain.
- Resuming loses nothing: signatures persist per vault id, and a resume only re-signs Assert and the depositor Payout.

## Files

| File | Purpose |
|---|---|
| `services/vault/src/dev/DelegatedClaimLedgerDriver.tsx` | The page: chain read, WOTS derivation, plan, device ceremony with resume, assembly, checks, downloads |
| `services/vault/src/dev/DelegatedClaimBroadcastPanel.tsx` | The "Claim on Bitcoin" panel: Claim broadcast, prover curl commands, proof pin, Assert, Payout |
| `services/vault/src/router.tsx` | Adds `/dev/claim-ledger`, under `import.meta.env.DEV` only |
| `scripts/dev-claim/find-vault-id.mjs` | PegIn txid → vault id, from the registry's registration events |
| `scripts/dev-claim/slim-vp-artifacts.mjs` | 1.4 GB VP response → `.slim.json`, recording the byte range of `babe_sessions` |
| `scripts/dev-claim/dry-plan.mjs` | Checks everything up to the device, with no wallet (`--real` once the vault is Redeemed) |
| `scripts/dev-claim/join-babe-sessions.mjs` | Splices the real BaBe sessions into the page's artifacts file |
| `scripts/dev-claim/jsonScan.mjs`, `loadVaultEnv.mjs` | Shared helpers: a streaming JSON byte scanner, and the `.env` reader |
