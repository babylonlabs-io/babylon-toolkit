/**
 * Every vault fact the claim needs, from chain and mempool, keyed by the one
 * value the page enters: the vault id.
 *
 * The SDK readers are the app's cached instances (sdk-readers.ts), built
 * against `CONTRACTS.BTC_VAULT_REGISTRY` from the same `.env` the app uses.
 */

import {
  buildVaultContextInputForClaim,
  canonicalizeBtcPubkey,
  readDelegatedClaimVaultContext,
  rebuildDepositTermsForClaim,
  stripHexPrefix,
  type DelegatedClaimVaultContext,
  type DelegatedClaimVaultRead,
  type DepositTerms,
  type OnChainBtcPubkey,
  type VaultContextInput,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { getTxHex } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { readRegistrationLogsWithGrace } from "@/clients/eth-contract/btc-vault-registry/query";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "@/config/pegin";

export interface ClaimChainContext {
  /** The whole SDK read, so the terms rebuild does not re-fetch what it holds. */
  read: DelegatedClaimVaultRead;
  vault: DelegatedClaimVaultContext;
  /** x-only, as registered: the form the VP's `depositor_pk` and `deriveContextHash` take. */
  depositorBtcPubkey: OnChainBtcPubkey;
  depositorWotsPkHash: Hex;
  prePeginTxHash: Hex;
  htlcVout: number;
  /** The vault's registered vault provider; addresses the VP proxy. */
  providerAddress: Address;
  /** Txid of the depositor-signed PegIn, the VP's artifact key and auth cache key. */
  peginTxid: string;
  /** The Pre-PegIn as broadcast, from mempool; its inputs are the vault context. */
  fundedPrePeginTxHex: string;
  vaultContextInput: VaultContextInput;
}

// The readers the context read Picks; the terms rebuild takes that read.
async function claimReaders() {
  const [
    vaultKeeperReader,
    universalChallengerReader,
    operationKeyReader,
    protocolParamsReader,
  ] = await Promise.all([
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
    getOperationKeyReader(),
    getProtocolParamsReader(),
  ]);
  const registry = getVaultRegistryReader();
  return {
    // The reader is a class instance, so the five methods the orchestrators
    // Pick are bound one by one; spreading it would drop every prototype method.
    registryReader: {
      getVaultData: registry.getVaultData.bind(registry),
      getVaultKeyEpochs: registry.getVaultKeyEpochs.bind(registry),
      getVaultProviderGenesisBtcPubKey:
        registry.getVaultProviderGenesisBtcPubKey.bind(registry),
      // Public nodes answer [] for a block they lack, so this one read runs
      // under the app's measured registration-log retry policy. No abort
      // signal is threaded through the harness, so none is passed.
      getRegistrationRecordsAtBlock: (createdAt: bigint) =>
        readRegistrationLogsWithGrace(() =>
          registry.getRegistrationRecordsAtBlock(createdAt),
        ),
      getVaultClaimableBy: registry.getVaultClaimableBy.bind(registry),
    },
    vaultKeeperReader,
    universalChallengerReader,
    operationKeyReader,
    protocolParamsReader,
  };
}

export async function readClaimChainContext(
  vaultId: Hex,
): Promise<ClaimChainContext> {
  const readers = await claimReaders();
  // Throws the SDK's typed VaultClaimableByNotFoundError until the vault is
  // claimable. For a Redeemed vault its message names the three remaining
  // causes — the redeem not finalized yet (~2 epochs behind the tip), a
  // keeper-only redeemForAVK, or a node that missed a block of the scan —
  // so the page shows it verbatim rather than guessing.
  const read = await readDelegatedClaimVaultContext({ vaultId, readers });

  // The reader already returns the vault provider and the PegIn txid (derived
  // through the SDK's dependency-free parser and cross-checked against both
  // registry logs), so no second getVaultData and no re-derivation here.
  const fundedPrePeginTxHex = await getTxHex(
    stripHexPrefix(read.prePeginTxHash),
    getMempoolApiUrl(),
  );
  const vaultContextInput = buildVaultContextInputForClaim({
    depositorBtcPubKey: read.depositorBtcPubKeyBytes32,
    fundedPrePeginTxHex,
    prePeginTxHash: read.prePeginTxHash,
  });

  return {
    read,
    vault: read.context,
    depositorBtcPubkey: read.depositorBtcPubkey,
    depositorWotsPkHash: read.depositorWotsPkHash,
    prePeginTxHash: read.prePeginTxHash,
    htlcVout: read.htlcVout,
    providerAddress: read.vaultProvider,
    peginTxid: stripHexPrefix(read.peginTxHash),
    fundedPrePeginTxHex,
    vaultContextInput,
  };
}

/**
 * The connected wallet must hold the vault's depositor key. Checked right
 * after the context read, before any VP auth or derivation prompt; the SDK
 * repeats it at signing time.
 */
export function assertWalletIsDepositor(
  chain: ClaimChainContext,
  walletPublicKeyHex: string,
): void {
  const walletKey = canonicalizeBtcPubkey(walletPublicKeyHex);
  if (walletKey !== chain.depositorBtcPubkey) {
    throw new Error(
      `Connected wallet key ${walletKey} is not this vault's depositor key ${chain.depositorBtcPubkey}; select the account that made the deposit.`,
    );
  }
}

/** Approval wallets only: the terms that load this vault's intent on the device. */
export async function readClaimDepositTerms(
  chain: ClaimChainContext,
  walletPublicKeyHex: string,
): Promise<DepositTerms> {
  return rebuildDepositTermsForClaim({
    // Everything the context read already fetched for this vault; only the
    // batch's siblings still need a registry call.
    read: chain.read,
    // The wallet's own key, not the on-chain one: the SDK refuses a wallet that is not the depositor.
    depositorBtcPubkey: walletPublicKeyHex,
    fundedPrePeginTxHex: chain.fundedPrePeginTxHex,
    siblingReader: getVaultRegistryReader(),
    mempoolApiUrl: getMempoolApiUrl(),
    // The value the deposit-time rebuild passed (rebuildDepositTerms.ts:475);
    // the core recomputes the HTLC scripts with it.
    network: getBTCNetworkForWASM(),
  });
}
