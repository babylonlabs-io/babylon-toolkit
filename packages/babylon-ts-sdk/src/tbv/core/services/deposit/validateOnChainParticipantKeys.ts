import type { Address } from "viem";

import type {
  UniversalChallengerReader,
  VaultKeeperReader,
  VaultRegistryReader,
} from "../../clients/eth/types";
import { processPublicKeyToXOnly } from "../../primitives/utils/bitcoin";

export interface ValidateOnChainParticipantKeysParams {
  vaultRegistryReader: VaultRegistryReader;
  vaultKeeperReader: VaultKeeperReader;
  universalChallengerReader: UniversalChallengerReader;
  vaultProviderEthAddress: Address;
  applicationEntryPoint: Address;
  expectedVaultProviderBtcPubkey: string;
  expectedVaultKeeperBtcPubkeys: string[];
  expectedUniversalChallengerBtcPubkeys: string[];
}

export interface ValidatedOnChainParticipantKeys {
  vaultProviderBtcPubkeyXOnly: string;
  vaultKeeperBtcPubkeysSorted: string[];
  universalChallengerBtcPubkeysSorted: string[];
  expectedAppVaultKeepersVersion: number;
  expectedUniversalChallengersVersion: number;
}

export async function validateOnChainParticipantKeys(
  params: ValidateOnChainParticipantKeysParams,
): Promise<ValidatedOnChainParticipantKeys> {
  const {
    vaultRegistryReader,
    vaultKeeperReader,
    universalChallengerReader,
    vaultProviderEthAddress,
    applicationEntryPoint,
    expectedVaultProviderBtcPubkey,
    expectedVaultKeeperBtcPubkeys,
    expectedUniversalChallengerBtcPubkeys,
  } = params;

  const [
    onChainVpKey,
    expectedAppVaultKeepersVersion,
    expectedUniversalChallengersVersion,
  ] = await Promise.all([
    vaultRegistryReader.getVaultProviderBtcPubKey(vaultProviderEthAddress),
    vaultKeeperReader.getCurrentVaultKeepersVersion(applicationEntryPoint),
    universalChallengerReader.getLatestUniversalChallengersVersion(),
  ]);

  const [onChainKeepers, onChainChallengers] = await Promise.all([
    vaultKeeperReader.getVaultKeepersByVersion(
      applicationEntryPoint,
      expectedAppVaultKeepersVersion,
    ),
    universalChallengerReader.getUniversalChallengersByVersion(
      expectedUniversalChallengersVersion,
    ),
  ]);

  const canonical = (k: string) => processPublicKeyToXOnly(k).toLowerCase();
  const sortedSet = (keys: string[]) => keys.map(canonical).sort();

  const expectedVpKeyXOnly = canonical(expectedVaultProviderBtcPubkey);
  if (expectedVpKeyXOnly !== onChainVpKey) {
    throw new Error(
      `Vault provider BTC pubkey indexer hint does not match BTCVaultRegistry for ${vaultProviderEthAddress}. Refresh and try again.`,
    );
  }

  const expectedKeepers = sortedSet(expectedVaultKeeperBtcPubkeys);
  const onChainKeepersSorted = sortedSet(
    onChainKeepers.map((p) => p.btcPubKey),
  );
  if (
    expectedKeepers.length !== onChainKeepersSorted.length ||
    expectedKeepers.some((k, i) => k !== onChainKeepersSorted[i])
  ) {
    throw new Error(
      `Vault keeper BTC pubkeys (v${expectedAppVaultKeepersVersion}) indexer set does not match ApplicationRegistry on-chain set. Refresh and try again.`,
    );
  }

  const expectedChallengers = sortedSet(expectedUniversalChallengerBtcPubkeys);
  const onChainChallengersSorted = sortedSet(
    onChainChallengers.map((p) => p.btcPubKey),
  );
  if (
    expectedChallengers.length !== onChainChallengersSorted.length ||
    expectedChallengers.some((k, i) => k !== onChainChallengersSorted[i])
  ) {
    throw new Error(
      `Universal challenger BTC pubkeys (v${expectedUniversalChallengersVersion}) indexer set does not match ProtocolParams on-chain set. Refresh and try again.`,
    );
  }

  return {
    vaultProviderBtcPubkeyXOnly: onChainVpKey,
    vaultKeeperBtcPubkeysSorted: onChainKeepersSorted,
    universalChallengerBtcPubkeysSorted: onChainChallengersSorted,
    expectedAppVaultKeepersVersion,
    expectedUniversalChallengersVersion,
  };
}
