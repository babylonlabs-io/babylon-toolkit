/**
 * Identity of the Ledger BTC Vault wallet. Kept apart from
 * `VaultWalletConnectionProvider` so a consumer can ask "is this the Ledger?"
 * without loading the connection provider and its wallet-connector imports.
 */

/** Wallet id of the Ledger BTC Vault app. */
export const LEDGER_VAULT_WALLET_ID = "ledger_btc_vault";

/**
 * Whether the connected BTC wallet is the Ledger BTC Vault app — the one
 * predicate the reclaim row (`hooks/deposit/useReclaimRowAction`), the
 * deposit reserve tooltip (`components/simple/SimpleDeposit`), the activation
 * split (`components/simple/ResumeDepositContent`) and the device-app hints
 * (`hooks/useLedgerVaultDevice`) must share.
 */
export function isLedgerVaultConnector(
  connector: { connectedWallet?: { id: string } | null } | null | undefined,
): boolean {
  return connector?.connectedWallet?.id === LEDGER_VAULT_WALLET_ID;
}
