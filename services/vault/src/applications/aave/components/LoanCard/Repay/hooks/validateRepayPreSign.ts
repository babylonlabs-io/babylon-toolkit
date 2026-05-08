/**
 * Repay pre-sign validation
 *
 * Runs immediately before submitting a repay transaction. Two independent
 * on-chain checks run in parallel:
 *
 * 1. **Reserve-id anchor (auditor #230)**:
 *    `assertVbtcReserveAnchoredToAdapter` proves the displayed
 *    `btcVaultCoreVbtcReserveId` matches the env-pinned adapter's
 *    immutable and that the spoke reserve at that id has
 *    `underlying === VAULT_BTC`. Without it, a poisoned reserve id flows
 *    through `refetchSplitParams` unnoticed.
 * 2. **CF freshness (auditor #260)**: `assertCfUnchanged` refetches risk
 *    parameters and asserts the fresh `liquidationThresholdBps` equals the
 *    one displayed on screen. React Query's query key does not change
 *    when CF is updated for the same `dynamicConfigKey`, so without this
 *    a governance/operator update that lowered CF would let the user sign
 *    a repay whose displayed risk-improvement projection ran against an
 *    obsolete threshold.
 */
import type { Address } from "viem";

import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import { assertVbtcReserveAnchoredToAdapter } from "../../../../services/assertVbtcReserveAnchoredToAdapter";
import { assertCfUnchanged } from "../../../../utils";

export interface ValidateRepayPreSignDeps {
  /**
   * Liquidation threshold (in BPS) the user saw on the displayed metrics.
   * Compared against the freshly-fetched value to detect on-chain CF moves
   * since the screen was rendered.
   */
  liquidationThresholdBps: number;
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
  /** Env-pinned Aave adapter — the trust root for the reserve-id anchor. */
  adapterAddress: Address;
  /**
   * The vBTC reserve id the UI currently believes is correct
   * (`config.btcVaultCoreVbtcReserveId` from the indexer). Cross-checked
   * against the adapter's immutable.
   */
  displayedVbtcReserveId: bigint;
}

/**
 * Throws if it is not safe to proceed with the repay:
 *  - displayed reserve id doesn't match the adapter's immutable, or the
 *    spoke's reserve at that id doesn't point to VAULT_BTC
 *  - split params could not be refetched
 *  - on-chain CF moved since the screen was rendered
 */
export async function validateRepayPreSign({
  liquidationThresholdBps,
  refetchSplitParams,
  adapterAddress,
  displayedVbtcReserveId,
}: ValidateRepayPreSignDeps): Promise<void> {
  await Promise.all([
    assertVbtcReserveAnchoredToAdapter(adapterAddress, displayedVbtcReserveId),
    assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams }),
  ]);
}
