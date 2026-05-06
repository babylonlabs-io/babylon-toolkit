/**
 * Typed marker for errors thrown by a caller-supplied `preSignValidation`
 * passed to `executeWithdraw`. Lets the transaction hook's catch surface
 * the error message verbatim instead of routing it through
 * `mapViemErrorToContractError`, which would prepend a misleading
 * "Withdraw Collateral failed:" prefix implying an on-chain revert that
 * never happened.
 *
 * Mirrors the `ReserveMismatchError` pattern used by `useBorrowTransaction`.
 */
export class WithdrawPreSignValidationError extends Error {
  readonly code = "WITHDRAW_PRE_SIGN_VALIDATION";
}
