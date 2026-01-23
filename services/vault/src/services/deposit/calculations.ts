/**
 * Deposit amount limits are now fetched from the ProtocolParams contract.
 *
 * Use `usePegInConfig()` hook to get:
 * - minDeposit: Minimum deposit amount from contract (minimumPegInAmount)
 * - MAX_DEPOSIT_SATS: Maximum deposit (21M BTC - Bitcoin's max supply)
 *
 * @see src/hooks/useProtocolParams.ts
 */
