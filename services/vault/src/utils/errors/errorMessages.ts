/**
 * User-friendly error messages for contract errors.
 *
 * Maps error names to human-readable messages. Names come from ts-sdk's
 * `vaultErrors.manifest.json`; a key the manifest does not list is dead.
 */
export const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  // ============================================================================
  // Aave Integration Adapter / Collateral Logic errors
  // ============================================================================
  InvalidProxyContract: "Invalid proxy contract address.",
  PositionNotHealthy:
    "You can't reorder BTCVaults while your position is at risk of liquidation. Repay debt or add collateral first.",
  // Reorder list is not a permutation of the position, or a withdraw names a
  // BTCVault the position does not hold.
  InvalidVaultsArray:
    "The BTCVault list doesn't match your current position. Refresh the page and try again.",

  // ============================================================================
  // BTCVaultRegistry errors
  // ============================================================================
  BTCVaultNotFound: "BTCVault not found. The BTCVault ID may be invalid.",
  VaultAlreadyExists: "A BTCVault with this ID already exists.",
  InvalidBTCVaultStatus:
    "The BTCVault is in an invalid status for this operation.",
  ActivationDeadlineExpired:
    "The activation deadline has passed. The BTCVault can no longer be activated.",
  // The opposite bound to ActivationDeadlineExpired: too early, not too late.
  // Resolves by waiting, so the copy asks for a retry rather than closing the
  // flow. Normally unreachable — the UI holds Activate closed for the window —
  // so this is the fallback for a governance change mid-flow.
  ActivationDelayNotElapsed:
    "The BTCVault activation window has not opened yet. The deposit list shows how long is left.",
  InvalidSecret:
    "The secret does not match the BTCVault's hashlock. Please verify your secret and try again.",
  InvalidHashlock: "The BTCVault does not have a valid hashlock configured.",
  // Fires at vault REGISTRATION (per-depositor hashlock uniqueness in
  // BTCVaultRegistry). Hashlocks are deterministic from BTC wallet +
  // selected UTXOs, so reusing the same UTXOs from the same wallet
  // produces the same hashlock and reverts here. Kept in sync with the
  // SDK signature-keyed copy in `babylon-ts-sdk/src/tbv/core/contracts/errors.ts`.
  DuplicateHashlock:
    "Duplicate deposit: a BTCVault with this hashlock is already registered to your wallet. Hashlocks are derived from your BTC wallet and selected UTXOs — use different UTXOs to create a unique deposit.",
  InvalidBTCPublicKey: "Invalid BTC public key format.",
  InvalidBTCProofOfPossession: "Invalid BTC proof of possession signature.",
  PeginTransactionExpired: "The peg-in transaction has expired.",
  PrePeginOutputAlreadyUsed:
    "This Pre-Pegin output has already been used by another BTCVault.",
  PeginTransactionAlreadyUsed:
    "This peg-in transaction has already been used to activate another BTCVault.",

  // ============================================================================
  // Vault Provider errors
  // ============================================================================
  NoUniversalChallengersConfigured: "No universal challengers are configured.",
  NoAppVaultKeepersConfigured: "No app vault keepers are configured.",
  EmptyVaultKeepers: "Vault Keepers list cannot be empty.",

  // ============================================================================
  // Application Registry errors
  // ============================================================================
  ApplicationAlreadyRegistered: "Application is already registered.",
  ApplicationNotRegistered: "Application is not registered.",
  InvalidApplicationStatus: "Invalid application status.",
  OnlyApplicationEntryPoint:
    "Only the application entry point can perform this action.",

  // ============================================================================
  // Aave Spoke errors
  // ============================================================================
  ReentrancyGuardReentrantCall: "Reentrant call detected.",
  // Reserve state and risk checks a borrow or repay can hit.
  ReservePaused:
    "This market is on hold, so it can't be used right now. Try again later.",
  ReserveFrozen: "This market isn't accepting new borrows right now.",
  ReserveNotBorrowable: "This asset can't be borrowed from this market.",
  MaximumUserReservesExceeded:
    "This position already borrows as many assets as it can. Fully repay a loan to borrow a different asset.",
  HealthFactorBelowThreshold:
    "This would drop your health factor below the liquidation threshold. Repay some debt, or borrow or withdraw less, and try again.",

  // ============================================================================
  // Aave Hub errors
  // ============================================================================
  // Fixed text for callers that have no reserve to name; the borrow and repay
  // forms scale and name the hub (describeAaveRevert).
  DrawCapExceeded:
    "This market has reached its borrow limit on its hub. Enter a lower amount or borrow from another hub.",
  InsufficientLiquidity:
    "The hub doesn't hold enough of this asset to cover the amount. Enter a lower amount and try again.",
  SpokeNotActive:
    "A hub this transaction depends on isn't accepting transactions right now. Try again later.",
  SpokeHalted:
    "The hub for this market has halted it. Try again once the halt is lifted.",
  InvalidPremiumChange:
    "A hub where you have debt rejected the rate update this transaction needs. Try again later.",

  // ============================================================================
  // BTC signature verification errors
  // ============================================================================
  InvalidBIP322Signature: "Invalid BIP-322 signature.",
  InvalidSValue: "Invalid signature S value.",
  InvalidWitnessData: "Invalid witness data.",
  PublicKeyMismatch: "Public key mismatch.",
  InvalidSignatureLength: "Invalid signature length.",
  UnsupportedAddressType: "Unsupported address type.",

  // ============================================================================
  // Pausing / Authorization errors
  // ============================================================================
  Unauthorized: "You are not authorized to perform this action.",
  TBV_Unauthorized: "You are not authorized to perform this action.",
  TBV_Paused: "The system is currently paused. Please try again later.",
  TBV_Frozen: "This action isn't available while the system is frozen.",
  TBV_AlreadyPaused: "The system is already paused.",
  TBV_NotPaused: "The system is not paused.",

  // ============================================================================
  // Generic / Validation errors
  // ============================================================================
  InvalidAmount: "The amount specified is invalid.",
  ZeroAddress: "Address cannot be zero.",
  ZeroAmount: "Amount cannot be zero.",
  TransferFailed: "Transfer failed.",
  FailedCall: "Contract call failed.",
  SafeERC20FailedOperation: "ERC20 token operation failed.",
  AddressEmptyCode: "Address has no code (not a contract).",
  VersionAlreadyExists: "This version already exists.",
  InvalidRegistrationFee: "Invalid registration fee.",
  AmountBelowMinimumThreshold: "Amount is below the minimum threshold.",
  InvalidAction: "Invalid action.",

  // ============================================================================
  // Crypto / Parsing errors
  // ============================================================================
  InvalidControlBlock: "Invalid control block.",
  InvalidPoint: "Invalid elliptic curve point.",
  InvalidXOnlyKey: "Invalid x-only public key.",
  BufferTooShort: "Buffer too short.",
  InvalidCompactSize: "Invalid compact size.",

  // ============================================================================
  // Access control errors
  // ============================================================================
  AccessControlBadConfirmation: "Access control confirmation failed.",
  AccessControlUnauthorizedAccount: "Account is not authorized for this role.",

  // ============================================================================
  // UUPS Proxy errors
  // ============================================================================
  UUPSUnauthorizedCallContext: "UUPS unauthorized call context.",
  UUPSUnsupportedProxiableUUID: "UUPS unsupported proxiable UUID.",
  ERC1967InvalidImplementation: "Invalid ERC1967 implementation.",
  ERC1967NonPayable: "ERC1967 non-payable error.",

  // ============================================================================
  // ERC20 errors
  // ============================================================================
  ERC20InsufficientBalance:
    "Insufficient token balance. You don't have enough tokens to complete this transaction.",
  ERC20InsufficientAllowance:
    "Insufficient token allowance. Please approve the contract to spend your tokens.",
  ERC20InvalidApprover: "Invalid approver address.",
  ERC20InvalidReceiver: "Invalid receiver address.",
  ERC20InvalidSender: "Invalid sender address.",
  ERC20InvalidSpender: "Invalid spender address.",

  // ============================================================================
  // Pegin / commission / VP-management errors (aave-v4)
  // ============================================================================
  VaultProviderCommissionExceeded:
    "The vault provider's commission rate exceeds your acceptable maximum. Please try again.",
  // Phase-agnostic by necessity: this map is consulted for BOTH a pre-broadcast
  // simulation failure (nothing signed or sent) and a mined revert, so it must
  // not assert anything about whether a transaction reached the chain.
  ApplicationNotActive:
    "The application this BTCVault is registered with is not active on the vault registry, so this operation cannot proceed.",
  BlocklistedVaultKeeper:
    "This vault keeper has been blocklisted and cannot perform this action.",
  PostExpiryGraceWindowElapsed:
    "The grace window to redeem this expired BTCVault has closed.",
  BtcKeyAlreadyRegistered: "This Bitcoin public key is already registered.",
  CommissionAboveMaximum:
    "The proposed commission exceeds the protocol maximum.",
  CommissionBelowMinimum:
    "The proposed commission is below the protocol minimum.",
  CommissionUnchanged: "The new commission is the same as the current value.",
  PeginInputSignatureAlreadySubmitted:
    "This peg-in input signature has already been submitted.",
  InvalidShortDelayArrays:
    "Timelock configuration contains invalid short-delay arrays.",
};
