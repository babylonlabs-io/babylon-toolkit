/**
 * Step 3: Payout signing - poll for transactions and submit signatures
 */

import type { Address, Hex } from "viem";

import { getVaultFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { getTimelockPeginByVersion } from "@/clients/eth-contract/protocol-params";
import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type {
  ClaimerSignatures,
  DepositorAsClaimerPresignatures,
} from "@/clients/vault-provider-rpc/types";
import { getBTCNetworkForWASM } from "@/config/pegin";
import { DaemonStatus, LocalStorageStatus } from "@/models/peginStateMachine";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
  prepareTransactionsForSigning,
  submitSignaturesToVaultProvider,
  type SigningContext,
} from "@/services/vault/vaultPayoutSignatureService";
import { waitForPeginStatus } from "@/services/vault/vaultPeginStatusService";
import { updatePendingPeginStatus } from "@/storage/peginStorage";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

import type { PayoutSigningContext, PayoutSigningParams } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Timeout for RPC requests (60 seconds) */
const RPC_TIMEOUT_MS = 60 * 1000;

/** Maximum polling timeout (20 minutes) - vault provider may take 15-20 minutes to prepare */
const MAX_POLLING_TIMEOUT_MS = 20 * 60 * 1000;

const TARGET_STATUS = new Set<string>([
  DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
]);

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Poll for payout transactions and prepare signing context.
 *
 * First polls `getPeginStatus` until the VP reaches `PendingDepositorSignatures`,
 * then calls `requestDepositorPresignTransactions` once to fetch the actual
 * transaction data. This avoids hammering the heavy presign endpoint while the
 * VP is still in earlier states (BaBe setup, challenger presigning, etc.).
 */
export async function pollAndPreparePayoutSigning(
  params: PayoutSigningParams,
): Promise<PayoutSigningContext> {
  const {
    btcTxid,
    btcTxHex,
    depositorBtcPubkey,
    providerAddress,
    providerBtcPubKey,
    vaultKeepers,
    universalChallengers,
    registeredPayoutScriptPubKey,
    signal,
  } = params;

  // Phase 1: Poll status until VP is ready for depositor signatures
  await waitForPeginStatus({
    providerAddress,
    btcTxid,
    targetStatuses: TARGET_STATUS,
    timeoutMs: MAX_POLLING_TIMEOUT_MS,
    signal,
  });

  // Phase 2: Fetch transaction data (VP is ready)
  const rpcClient = new VaultProviderRpcApi(
    getVpProxyUrl(providerAddress),
    RPC_TIMEOUT_MS,
  );
  const response = await rpcClient.requestDepositorPresignTransactions({
    pegin_txid: stripHexPrefix(btcTxid),
    depositor_pk: stripHexPrefix(depositorBtcPubkey),
  });

  // Derive timelockPegin from the vault's locked offchainParamsVersion.
  // Using the latest offchain params would produce invalid signatures if
  // timelockAssert changed between vault creation and payout signing.
  const vault = await getVaultFromChain(btcTxid as Hex);
  const timelockPegin = await getTimelockPeginByVersion(
    vault.offchainParamsVersion,
  );

  const vaultKeeperBtcPubkeys = getSortedVaultKeeperPubkeys(vaultKeepers);
  const universalChallengerBtcPubkeys =
    getSortedUniversalChallengerPubkeys(universalChallengers);

  const context: SigningContext = {
    peginTxHex: btcTxHex,
    vaultProviderBtcPubkey: stripHexPrefix(providerBtcPubKey),
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    depositorBtcPubkey,
    timelockPegin,
    network: getBTCNetworkForWASM(),
    registeredPayoutScriptPubKey,
  };

  return {
    context,
    vaultProviderAddress: providerAddress,
    preparedTransactions: prepareTransactionsForSigning(response.txs),
    depositorGraph: response.depositor_graph,
  };
}

/**
 * Submit payout signatures to vault provider.
 */
export async function submitPayoutSignatures(
  vaultProviderAddress: string,
  btcTxid: string,
  depositorBtcPubkey: string,
  signatures: Record<string, ClaimerSignatures>,
  depositorEthAddress: Address,
  depositorClaimerPresignatures: DepositorAsClaimerPresignatures,
): Promise<void> {
  await submitSignaturesToVaultProvider(
    vaultProviderAddress,
    btcTxid,
    depositorBtcPubkey,
    signatures,
    depositorClaimerPresignatures,
  );

  updatePendingPeginStatus(
    depositorEthAddress,
    btcTxid,
    LocalStorageStatus.PAYOUT_SIGNED,
  );
}
