# Delegated claim — depositor as claimer

A single-page harness for `services/delegated-claim`. The depositor's vault
provider is offline, so the depositor assembles the watchtower files and runs
the claim from the browser instead of from `vaultd vp wt`.

This is the page the module JSDoc refers to. It is a harness, not a product
surface: it holds no state, it speaks to `window.unisat` directly instead of
through `babylon-wallet-connector`, and it has been run end to end on **signet
only**. Every SDK export it calls is `@experimental` and can change shape in a
minor release.

## Run it

```bash
nvm use 24
pnpm --filter @babylonlabs-io/ts-sdk run build   # the page imports dist/
pnpm --filter @babylonlabs-io/ts-sdk exec vite --config examples/delegated-claim/vite.config.mjs
```

Open the URL Vite prints, in a browser with the UniSat extension on signet.
`vite build` with the same config writes a static bundle to `dist/`.

## The eight steps

| Step | SDK call |
|---|---|
| 1 Connect | — UniSat, wrapped as a `BitcoinWallet` |
| 2 Load artifacts | — the vault provider's `requestDepositorClaimerArtifacts` response |
| 3 Vault context | — read from the vault's on-chain registration |
| 4 WOTS keypair | `deriveClaimerWotsKeypair` |
| 5 Assemble | `assembleWatchtowerArtifacts` |
| 6 Claim | `assertArtifactsUsableForVault`, then broadcast `claim_tx` |
| 7 Assert | `pinPegoutProof`, then `attachFinalizedAssert` |
| 8 Payout | `finalizePayout` |

Steps 4 and 5 produce `wots_keypair.json` and `artifacts.json` — the same two
files `vaultd vp wt` consumes, so the CLI can take over at any point after
step 5.

Save the `artifacts.json` step 7 returns. A one-time WOTS keypair signs exactly
one proof, so `pinPegoutProof` refuses a second, different one once a proof is
pinned.

## Known limits

- **The prover is not reachable from a browser.** Step 7 needs a Groth16 proof.
  The prover is healthy JSON-RPC (`prover_submitClaimEvent` → jobId, then
  `prover_getProof`), but its CORS preflight answers 405 with no
  `Access-Control-*` headers, so the page cannot call it. The proof is fetched
  with curl and pasted into step 7 by hand. See `TODO(prover-exposure)` in the
  source: either the prover sends CORS headers, or a backend fetches proofs.
- **Nothing here watches the chain.** A `ChallengeAssert` must be answered with
  `finalizeWronglyChallenged` inside `timelock_challenge_assert`, and noticing
  one is the caller's job. This page has no step 9.
- **The raw provider response is too large for a browser.** Almost all of it is
  `babe_sessions`; the graph itself is under 2 MB. V8 caps strings near 512 MB,
  so `JSON.parse` on the raw file fails with "Unexpected end of JSON input".
  Slim it to `tx_graph_json` and `verifying_key_hex` before step 2, and join
  the sessions in downstream.
- **`Buffer` is not defined in browsers.** The SDK touches it at import time,
  so the page sets `globalThis.Buffer` before the dynamic import. A real app
  does this in its bundler config.

## See also

- `btc-vault` `docs/delegated_claim.md` — the protocol this implements.
- `packages/babylon-ts-sdk/src/tbv/core/services/delegated-claim/index.ts` —
  the module JSDoc, which lists what stays outside this surface.
