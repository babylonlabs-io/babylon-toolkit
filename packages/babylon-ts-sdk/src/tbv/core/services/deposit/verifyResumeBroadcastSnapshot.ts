import type { Address } from "viem";

import type { VaultRegistryReader } from "../../clients/eth/types";

import type { PeginBuildSnapshot } from "./peginBuildSnapshot";

export interface VerifyResumeBroadcastSnapshotParams {
  vaultRegistryReader: VaultRegistryReader;
  onChain: {
    offchainParamsVersion: number;
    appVaultKeepersVersion: number;
    universalChallengersVersion: number;
    vaultProvider: Address;
  };
  buildSnapshot: PeginBuildSnapshot;
}

export async function verifyResumeBroadcastSnapshot(
  params: VerifyResumeBroadcastSnapshotParams,
): Promise<void> {
  const { vaultRegistryReader, onChain, buildSnapshot } = params;

  if (onChain.offchainParamsVersion !== buildSnapshot.offchainParamsVersion) {
    throw new Error(
      `Aborting BTC broadcast: offchain params version mismatch (on-chain v${onChain.offchainParamsVersion}, built against v${buildSnapshot.offchainParamsVersion}). Pre-PegIn scripts cannot be verified by the current parameter set. The ETH vault will time out per protocol rules.`,
    );
  }

  if (onChain.appVaultKeepersVersion !== buildSnapshot.appVaultKeepersVersion) {
    throw new Error(
      `Aborting BTC broadcast: vault keeper version mismatch (on-chain v${onChain.appVaultKeepersVersion}, built against v${buildSnapshot.appVaultKeepersVersion}). Pre-PegIn scripts cannot be verified by the current keeper set. The ETH vault will time out per protocol rules.`,
    );
  }

  if (
    onChain.universalChallengersVersion !==
    buildSnapshot.universalChallengersVersion
  ) {
    throw new Error(
      `Aborting BTC broadcast: universal challenger version mismatch (on-chain v${onChain.universalChallengersVersion}, built against v${buildSnapshot.universalChallengersVersion}). Pre-PegIn scripts cannot be verified by the current challenger set. The ETH vault will time out per protocol rules.`,
    );
  }

  const onChainVpKey = await vaultRegistryReader.getVaultProviderBtcPubKey(
    onChain.vaultProvider,
  );
  if (onChainVpKey !== buildSnapshot.vaultProviderBtcPubkeyXOnly) {
    throw new Error(
      `Aborting BTC broadcast: vault provider BTC pubkey changed since build time. Pre-PegIn scripts cannot be verified. The ETH vault will time out per protocol rules.`,
    );
  }
}
