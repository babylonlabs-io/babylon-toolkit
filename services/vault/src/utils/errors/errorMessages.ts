/**
 * User-friendly error messages for contract errors.
 *
 * Maps error names from contract ABIs to human-readable messages.
 * Source: vault-contracts-aave-v4/snapshots/selectors.md
 */
export const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  // ============================================================================
  // Aave Integration Controller / Collateral Logic errors
  // ============================================================================
  DebtMustBeRepaidFirst:
    "You must repay all debt before withdrawing collateral.",
  PositionNotFound: "Position not found. You may not have an active position.",
  PositionAlreadyExists: "A position already exists for this account.",
  NoCollateralToLiquidate: "No collateral available for liquidation.",
  VaultAlreadyInPosition: "This vault is already being used in a position.",
  InvalidProxyContract: "Invalid proxy contract address.",
  ProxyMismatch: "Proxy contract mismatch.",
  NoDebtToLiquidate: "No debt available to liquidate.",
  IncompleteLiquidation: "Liquidation was incomplete.",
  ZeroBorrowAmount: "Borrow amount cannot be zero.",
  InvalidFairnessPaymentTokenDecimals:
    "Invalid fairness payment token decimals.",

  // ============================================================================
  // BTCVaultsManager errors
  // ============================================================================
  BTCVaultNotFound: "Vault not found. The vault ID may be invalid.",
  VaultNotActive: "This vault is not active.",
  VaultAlreadyRedeemed: "This vault has already been redeemed.",
  VaultAlreadyExists: "A vault with this ID already exists.",
  InvalidVaultStatus: "The vault is in an invalid status for this operation.",
  VaultNotEscrowed: "The vault is not in escrow.",
  VaultSwapNotSet: "Vault swap is not configured.",
  InvalidBTCPublicKey: "Invalid BTC public key format.",
  InvalidBTCProofOfPossession: "Invalid BTC proof of possession signature.",
  BtcKeyMismatch: "BTC key mismatch.",
  InvalidTransactionHashLength: "Invalid transaction hash length.",
  PeginTransactionExpired: "The pegin transaction has expired.",
  InclusionProofVerificationFailed:
    "Bitcoin inclusion proof verification failed.",
  BitcoinTransactionParsingFailed: "Failed to parse Bitcoin transaction.",

  // ============================================================================
  // Vault Provider errors
  // ============================================================================
  ProviderAlreadyRegistered: "Vault provider is already registered.",
  ProviderRegisteredForDifferentApp:
    "Provider is registered for a different application.",
  InvalidProviderStatus: "Invalid vault provider status.",
  NoUniversalChallengersConfigured: "No universal challengers are configured.",
  NoAppVaultKeepersConfigured: "No app vault keepers are configured.",
  EmptyVaultKeepers: "Vault keepers list cannot be empty.",
  VaultKeeperNotAuthorized: "Vault keeper is not authorized.",

  // ============================================================================
  // Application Registry errors
  // ============================================================================
  ApplicationAlreadyRegistered: "Application is already registered.",
  ApplicationNotRegistered: "Application is not registered.",
  InvalidApplicationStatus: "Invalid application status.",
  OnlyApplicationController:
    "Only the application controller can perform this action.",
  IntegrationControllerNotSet: "Integration controller is not set.",
  AaveControllerNotSet: "Aave controller is not set.",

  // ============================================================================
  // Aave Spoke errors
  // ============================================================================
  AlreadyInitialized: "Contract is already initialized.",
  ReentrancyGuardReentrantCall: "Reentrant call detected.",
  InsufficientAvailableBalance: "Insufficient available balance.",
  FlashLoanRepaymentFailed: "Flash loan repayment failed.",
  InsufficientProfit: "Insufficient profit for this operation.",
  EscrowNotEmpty: "Escrow is not empty.",
  FairnessPaymentTokenNotSet: "Fairness payment token is not set.",
  FeeRecipientNotConfigured: "Fee recipient is not configured.",
  DuplicateVaultId: "Duplicate vault ID.",

  // ============================================================================
  // Bitcoin verification errors
  // ============================================================================
  InvalidMerkleProof: "Invalid Merkle proof.",
  MerkleProofVerificationFailed: "Merkle proof verification failed.",
  BlockNotInCanonicalChain: "Block is not in the canonical chain.",
  InsufficientConfirmations: "Insufficient Bitcoin confirmations.",
  TransactionNotInProof: "Transaction not found in proof.",
  InvalidCMerkleBlockFormat: "Invalid CMerkle block format.",

  // ============================================================================
  // BTC signature verification errors
  // ============================================================================
  InvalidBIP322Signature: "Invalid BIP-322 signature.",
  InvalidSValue: "Invalid signature S value.",
  InvalidWitnessData: "Invalid witness data.",
  SignatureRecoveryFailed: "Signature recovery failed.",
  PublicKeyMismatch: "Public key mismatch.",
  InvalidSignatureLength: "Invalid signature length.",
  InvalidBTCSigType: "Invalid BTC signature type.",
  UnsupportedAddressType: "Unsupported address type.",

  // ============================================================================
  // Pausing / Authorization errors
  // ============================================================================
  Unauthorized: "You are not authorized to perform this action.",
  TBV_Unauthorized: "You are not authorized to perform this action.",
  TBV_Paused: "The system is currently paused. Please try again later.",
  TBV_AlreadyPaused: "The system is already paused.",
  TBV_NotPaused: "The system is not paused.",

  // ============================================================================
  // Generic / Validation errors
  // ============================================================================
  InvalidAmount: "The amount specified is invalid.",
  InsufficientBalance: "Insufficient balance for this operation.",
  ZeroAddress: "Address cannot be zero.",
  ZeroAmount: "Amount cannot be zero.",
  InvalidVault: "Invalid vault.",
  FailedDeployment: "Contract deployment failed.",
  ProxyDeploymentFailed: "Proxy deployment failed.",
  TransferFailed: "Token transfer failed.",
  FailedCall: "Contract call failed.",
  SafeERC20FailedOperation: "ERC20 token operation failed.",
  AddressEmptyCode: "Address has no code (not a contract).",
  VersionAlreadyExists: "This version already exists.",
  InvalidRegistrationFee: "Invalid registration fee.",
  AmountMismatch: "Amount mismatch.",
  AmountBelowMinimumThreshold: "Amount is below the minimum threshold.",
  AlreadyACKed: "Already acknowledged.",
  InvalidAction: "Invalid action.",

  // ============================================================================
  // Crypto / Parsing errors
  // ============================================================================
  InvalidControlBlock: "Invalid control block.",
  InvalidPoint: "Invalid elliptic curve point.",
  InvalidXOnlyKey: "Invalid x-only public key.",
  BufferTooShort: "Buffer too short.",
  CompactSizeTooLarge: "Compact size too large.",
  InvalidCompactSize: "Invalid compact size.",
  NotImplemented: "Feature not implemented.",
  ScriptTooLong: "Script too long.",

  // ============================================================================
  // Bitcoin header / relay errors
  // ============================================================================
  BadParent: "Invalid parent block.",
  BadParentHeight: "Invalid parent block height.",
  HashAboveTarget: "Block hash is above target.",
  InsufficientChainLength: "Insufficient chain length.",
  InsufficientTotalDifficulty: "Insufficient total difficulty.",
  InvalidDifficultyTarget: "Invalid difficulty target.",
  InvalidTimestampOrder: "Invalid timestamp order.",
  NoBlocksSubmitted: "No blocks submitted.",
  NoParent: "No parent block found.",
  TooDeepReorg: "Reorganization is too deep.",
  WrongDifficultyBits: "Wrong difficulty bits.",
  WrongHeaderLength: "Wrong header length.",

  // ============================================================================
  // Access control errors
  // ============================================================================
  AccessControlBadConfirmation: "Access control confirmation failed.",
  AccessControlUnauthorizedAccount: "Account is not authorized for this role.",
  NotVigilante: "Caller is not a vigilante.",
  OldDifficultyPeriod: "Difficulty period is too old.",
  TargetExceedsPowLimit: "Target exceeds proof of work limit.",
  MissingPeriodTimestamps: "Missing period timestamps.",

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
};
