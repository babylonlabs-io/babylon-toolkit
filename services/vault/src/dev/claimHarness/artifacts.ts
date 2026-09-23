/**
 * The vault-provider bundle, through the app's streaming pipeline.
 *
 * `vaultProvider_requestDepositorClaimerArtifacts` is bearer-gated
 * (`GRPC_AUTH_GATED_METHODS`, ts-sdk `auth/gatedMethods.ts:27-29`), and the
 * service looks the bearer up by pegin txid (`artifactDownloadService.ts:150-157`),
 * so the token is primed first with the app's own helper. Its Pre-PegIn hash
 * guard compares `Transaction.getId()` values (`calculateBtcTxHash`,
 * `utils/transaction/btcTxHash.ts:23-33`), which ignore the witness, so the
 * funded transaction from mempool satisfies it exactly as the unsigned one
 * does in the deposit flow.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

import { ensureAuthenticatedVpClient } from "@/hooks/deposit/depositFlowSteps/ensureAuthenticatedVpClient";
import {
  fetchAndDownloadArtifacts,
  openSaveTarget,
  type ArtifactDownloadOutcome,
  type ArtifactSaveTarget,
  type CapturedClaimerPayload,
} from "@/services/artifacts";

import type { ClaimChainContext } from "./chainReads";

const HARNESS_PICKER_DESCRIPTION = "Delegated-claim JSON";

export type ClaimerSource = CapturedClaimerPayload;

interface DownloadClaimerArtifactsParams {
  wallet: BitcoinWallet;
  chain: ClaimChainContext;
  /** From `openArtifactSaveTarget`, opened synchronously in the click handler. */
  target: ArtifactSaveTarget;
  onProgress: (receivedBytes: number, totalBytes: number) => void;
}

export async function downloadClaimerArtifacts(
  params: DownloadClaimerArtifactsParams,
): Promise<{ outcome: ArtifactDownloadOutcome; source: ClaimerSource }> {
  const { wallet, chain, target, onProgress } = params;

  // Cold path: one deriveContextHash prompt (a device screen on Ledger), then
  // the token is cached under the pegin txid for the rest of the tab.
  await ensureAuthenticatedVpClient({
    btcWallet: wallet,
    vaultId: chain.vault.vaultId,
    unsignedPrePeginTxHex: chain.fundedPrePeginTxHex,
    peginTxHash: chain.peginTxid,
    providerAddress: chain.providerAddress,
    depositorBtcPubkey: chain.depositorBtcPubkey,
  });

  let source: ClaimerSource | undefined;
  const outcome = await fetchAndDownloadArtifacts(
    chain.providerAddress,
    chain.peginTxid,
    chain.depositorBtcPubkey,
    target,
    {
      onProgress,
      onPayloadCaptured: (payload) => {
        source = payload;
      },
    },
  );
  if (!source) {
    throw new Error(
      "Artifact download finished without handing over tx_graph_json and verifying_key_hex.",
    );
  }
  return { outcome, source };
}

/**
 * Writes a small JSON file where the user chooses. Call from a click handler
 * before any `await`: the save dialog needs transient user activation.
 */
export async function saveTextFile(
  filename: string,
  text: string,
): Promise<string> {
  const target = await openSaveTarget({
    filename,
    pickerDescription: HARNESS_PICKER_DESCRIPTION,
  });
  const stream = await target.open();
  try {
    await stream.write(new TextEncoder().encode(text));
  } catch (error) {
    await stream.discard();
    throw error;
  }
  await stream.commit();
  return target.filename;
}
