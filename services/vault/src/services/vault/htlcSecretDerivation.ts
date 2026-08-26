/**
 * HTLC secret derivation — shared by the normal activation flow and the
 * activate-and-redeem withdraw modal so the two can never drift on the
 * signing-critical input handling:
 *
 * - depositor pubkey / htlcVout are read from the on-chain registry (indexer
 *   data is untrusted for derivation domain separators);
 * - the indexer-supplied Pre-PegIn tx is verified against the on-chain
 *   `prePeginTxHash` before `deriveVaultRoot` fires the wallet popup;
 * - intermediate secret buffers are zero-wiped before this resolves (the
 *   `finally` runs before the return value is handed to the caller).
 *
 * The returned hex string goes to the activation state machine
 * (`useVaultActions.handleActivation`), which re-validates
 * `sha256(secret) === hashlock` against the on-chain registry before any
 * calldata is assembled.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  deriveVaultRoot,
  expandHashlockSecret,
  hexToUint8Array,
  parseFundingOutpointsFromTx,
  uint8ArrayToHex,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Hex } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import type { VaultActivity } from "@/types/activity";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";

export async function deriveHtlcSecretHex(params: {
  activity: VaultActivity;
  btcWalletProvider: BitcoinWallet;
  connectedBtcAddress: string;
  walletId: string | undefined;
}): Promise<string> {
  const { activity, btcWalletProvider, connectedBtcAddress, walletId } = params;
  if (!activity.unsignedPrePeginTx) {
    throw new Error(
      "Missing Pre-Pegin transaction; cannot recover HTLC secret",
    );
  }

  let root: Uint8Array | null = null;
  let secretBytes: Uint8Array | null = null;
  try {
    // Read signing-critical inputs (depositor pubkey, htlcVout) directly
    // from the registry. Indexer data is untrusted for derivation domain
    // separators.
    const reader = getVaultRegistryReader();
    const { basic, protocol } = await reader.getVaultData(activity.id as Hex);
    const depositorBtcPubkey = basic.depositorBtcPubKey;
    const htlcVout = protocol.htlcVout;
    const onChainPrePeginTxHash = protocol.prePeginTxHash;

    // Indexer-supplied tx is untrusted. Verify against on-chain
    // prePeginTxHash before deriveVaultRoot fires the wallet popup.
    const computedTxHash = calculateBtcTxHash(activity.unsignedPrePeginTx);
    if (computedTxHash.toLowerCase() !== onChainPrePeginTxHash.toLowerCase()) {
      throw new Error(
        `Vault Creation transaction hash mismatch: computed ${computedTxHash} from indexer tx, ` +
          `but on-chain contract has ${onChainPrePeginTxHash}. ` +
          `Aborting to prevent potential attack.`,
      );
    }

    const fundingOutpoints = parseFundingOutpointsFromTx(
      activity.unsignedPrePeginTx,
    );

    // Probe the wallet before deriveVaultRoot fires the signing popup. A
    // wallet that locked since the modal opened fails fast here with an
    // actionable error instead of a silent no-op (no popup appears).
    await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
      probeConnection: shouldProbeWalletLiveness(walletId),
    });

    root = await deriveVaultRoot(btcWalletProvider, {
      depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
      fundingOutpoints,
    });

    secretBytes = await expandHashlockSecret(root, htlcVout);
    return uint8ArrayToHex(secretBytes);
  } finally {
    // Memory wipes run on every path — success, thrown error, or a caller
    // that abandoned the await. Neither buffer is needed past the hex
    // extraction, and `finally` runs before the return value is delivered,
    // so no live secret material lingers while the caller's on-chain calls
    // run.
    root?.fill(0);
    secretBytes?.fill(0);
  }
}
