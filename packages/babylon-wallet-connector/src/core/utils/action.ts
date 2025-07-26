// Below actions align with what's in the btc-staking-ts package.
// We keep a duplicated copy here as the manager.ts will be moved to its own
// sdk later.
export interface Action {
  name: ActionName;
  // Other metadata fields will be added as needed.
}

export enum ActionName {
  SIGN_BTC_STAKING_TRANSACTION = "sign-btc-staking-transaction",
  SIGN_BTC_UNBONDING_TRANSACTION = "sign-btc-unbonding-transaction",
  SIGN_BTC_WITHDRAW_TRANSACTION = "sign-btc-withdraw-transaction",
  SIGN_BTC_SLASHING_TRANSACTION = "sign-btc-slashing-transaction",
  SIGN_BTC_UNBONDING_SLASHING_TRANSACTION = "sign-btc-unbonding-slashing-transaction",
}
