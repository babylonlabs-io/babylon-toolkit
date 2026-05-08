import type { PeginDisplayLabel } from "@/models/peginStateMachine";

export interface Asset {
  /**
   * Unique on-chain reserve identifier (stringified bigint).
   * Required because token symbols are not unique within a Core Spoke
   * (e.g. bridged vs. native variants of the same stablecoin can collide).
   * The borrow/repay flows must dispatch by this id, not by `symbol`.
   */
  reserveId: string;
  name: string;
  symbol: string;
  icon: string;
  priceUsd?: number;
}

export interface VaultData {
  id: string;
  /** BTC amount (for display and sorting) */
  amount: number;
  /** USD value (for display and sorting) */
  usdValue: number;
  provider: {
    name: string;
    /** Icon URL - undefined will use Avatar component's built-in fallback */
    icon?: string;
  };
  /** Vault status from centralized state machine */
  status: PeginDisplayLabel;
}
