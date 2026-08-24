/**
 * Explicit lazy boundary around the optional vault-WASM package.
 *
 * Importing the SDK (including its legacy root barrels) does not resolve the
 * WASM package or generated binary. The peer is loaded only when a caller
 * invokes an operation that actually needs the Bitcoin transaction graph.
 * ETH-only entry points never import this module.
 *
 * @module tbv/core/wasm
 */

import type {
  AssertNoPayoutScriptInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
  HtlcConnectorInfo,
  HtlcConnectorParams,
  Network,
  PayoutConnectorInfo,
  PayoutConnectorParams,
  PeginP2aAnchorInfo,
  PeginTxResult,
  PrePeginParams,
  PrePeginResult,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants";

type TbvWasmModule = typeof import("@babylonlabs-io/babylon-tbv-rust-wasm");

let wasmModulePromise: Promise<TbvWasmModule> | undefined;
type RawTbvWasmModule =
  typeof import("@babylonlabs-io/babylon-tbv-rust-wasm/raw");
let rawWasmModulePromise: Promise<RawTbvWasmModule> | undefined;

/** Load the optional WASM peer on first use and share the in-flight import. */
export function loadTbvWasm(): Promise<TbvWasmModule> {
  wasmModulePromise ??= import("@babylonlabs-io/babylon-tbv-rust-wasm").catch(
    (error: unknown) => {
      wasmModulePromise = undefined;
      throw new Error(
        "This operation requires the optional " +
          "@babylonlabs-io/babylon-tbv-rust-wasm peer dependency.",
        { cause: error },
      );
    },
  );
  return wasmModulePromise;
}

/**
 * Load the explicit raw-class entry for the one SDK primitive that must
 * reconstruct a stateful WASM transaction object (refund construction).
 */
export function loadRawTbvWasm(): Promise<RawTbvWasmModule> {
  rawWasmModulePromise ??= import("@babylonlabs-io/babylon-tbv-rust-wasm/raw")
    .catch((error: unknown) => {
      rawWasmModulePromise = undefined;
      throw new Error(
        "This operation requires the optional raw vault-WASM peer entry.",
        { cause: error },
      );
    })
    .then(async (wasm) => {
      try {
        await wasm.initWasm();
      } catch (error: unknown) {
        rawWasmModulePromise = undefined;
        throw new Error(
          "The raw vault-WASM peer entry resolved but its WebAssembly " +
            "binary failed to initialize.",
          { cause: error },
        );
      }
      return wasm;
    });
  return rawWasmModulePromise;
}

export async function initWasm(): Promise<void> {
  const wasm = await loadTbvWasm();
  await wasm.initWasm();
}

export async function createPrePeginTransaction(
  params: PrePeginParams,
): Promise<PrePeginResult> {
  return (await loadTbvWasm()).createPrePeginTransaction(params);
}

export async function buildPeginTxFromPrePegin(
  params: PrePeginParams,
  timelockPegin: number,
  fundedPrePeginTxHex: string,
  htlcVout: number,
): Promise<PeginTxResult> {
  return (await loadTbvWasm()).buildPeginTxFromPrePegin(
    params,
    timelockPegin,
    fundedPrePeginTxHex,
    htlcVout,
  );
}

export async function getPrePeginHtlcConnectorInfo(
  params: HtlcConnectorParams,
): Promise<HtlcConnectorInfo> {
  return (await loadTbvWasm()).getPrePeginHtlcConnectorInfo(params);
}

export async function computeMinClaimValue(
  txGraphVersion: number,
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  return (await loadTbvWasm()).computeMinClaimValue(
    txGraphVersion,
    numLocalChallengers,
    numUniversalChallengers,
    councilQuorum,
    councilSize,
    feeRate,
  );
}

export async function computeMinPeginFee(
  txGraphVersion: number,
  numVks: number,
  numUcs: number,
  minPeginFeeRate: bigint,
): Promise<bigint> {
  return (await loadTbvWasm()).computeMinPeginFee(
    txGraphVersion,
    numVks,
    numUcs,
    minPeginFeeRate,
  );
}

export async function computePayoutFeeFloor(
  txGraphVersion: number,
  numVaultKeepers: number,
  numUniversalChallengers: number,
  numLocalChallengers: number,
  councilSize: number,
  out0Len: number,
  out1Len: number | null | undefined,
  feeRate: bigint,
): Promise<bigint> {
  return (await loadTbvWasm()).computePayoutFeeFloor(
    txGraphVersion,
    numVaultKeepers,
    numUniversalChallengers,
    numLocalChallengers,
    councilSize,
    out0Len,
    out1Len,
    feeRate,
  );
}

export async function supportedTxGraphVersions(): Promise<number[]> {
  return (await loadTbvWasm()).supportedTxGraphVersions();
}

export async function peginP2aAnchorOutput(
  txGraphVersion: number,
): Promise<PeginP2aAnchorInfo | null> {
  return (await loadTbvWasm()).peginP2aAnchorOutput(txGraphVersion);
}

export async function validatePeginP2aAnchor(
  txGraphVersion: number,
  txHex: string,
): Promise<void> {
  return (await loadTbvWasm()).validatePeginP2aAnchor(txGraphVersion, txHex);
}

export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
  return (await loadTbvWasm()).createPayoutConnector(params, network);
}

export async function getPeginPayoutScriptInfo(
  params: PayoutConnectorParams,
): Promise<{ payoutScript: string; payoutControlBlock: string }> {
  return (await loadTbvWasm()).getPeginPayoutScriptInfo(params);
}

export async function getAssertPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutScriptInfo> {
  return (await loadTbvWasm()).getAssertPayoutScriptInfo(params);
}

export async function getAssertNoPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
  challengerPubkey: string,
): Promise<AssertNoPayoutScriptInfo> {
  return (await loadTbvWasm()).getAssertNoPayoutScriptInfo(
    params,
    challengerPubkey,
  );
}

export async function getChallengeAssertScriptInfo(
  params: ChallengeAssertConnectorParams,
): Promise<ChallengeAssertScriptInfo> {
  return (await loadTbvWasm()).getChallengeAssertScriptInfo(params);
}

export async function expandAuthAnchor(root: Uint8Array): Promise<Uint8Array> {
  return (await loadTbvWasm()).expandAuthAnchor(root);
}

export async function expandHashlockSecret(
  root: Uint8Array,
  htlcVout: number,
): Promise<Uint8Array> {
  return (await loadTbvWasm()).expandHashlockSecret(root, htlcVout);
}

export async function expandWotsSeed(
  root: Uint8Array,
  htlcVout: number,
): Promise<Uint8Array> {
  return (await loadTbvWasm()).expandWotsSeed(root, htlcVout);
}

export async function deriveVaultId(
  peginTxHash: string,
  depositor: string,
): Promise<string> {
  return (await loadTbvWasm()).deriveVaultId(peginTxHash, depositor);
}

export type {
  AssertNoPayoutScriptInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
  HtlcConnectorInfo,
  HtlcConnectorParams,
  Network,
  PayoutConnectorInfo,
  PayoutConnectorParams,
  PeginP2aAnchorInfo,
  PeginTxResult,
  PrePeginParams,
  PrePeginResult,
};
