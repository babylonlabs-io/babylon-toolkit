/**
 * BTCVaultRegistry Contract ABI
 *
 * Minimal ABI containing only the functions needed by the SDK.
 * Full ABI is available in the vault service package.
 *
 * @module contracts/abis/BTCVaultRegistry
 */

/**
 * Minimal ABI for BTCVaultRegistry contract.
 * Contains submitPeginRequest, submitPeginRequestBatch, activateVaultWithSecret, getPegInFee, getBtcVaultBasicInfo, and getVaultProviderCommission.
 */
export const BTCVaultRegistryABI = [
  {
    type: "function",
    name: "submitPeginRequest",
    inputs: [
      {
        name: "depositor",
        type: "address",
        internalType: "address",
      },
      {
        name: "depositorBtcPubKey",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "btcPopSignature",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "unsignedPrePeginTx",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "depositorSignedPeginTx",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "vaultProvider",
        type: "address",
        internalType: "address",
      },
      {
        name: "maxAcceptableCommissionBps",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "hashlock",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "htlcVout",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "depositorPayoutBtcAddress",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "depositorWotsPkHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "submitPeginRequest",
    inputs: [
      {
        name: "depositor",
        type: "address",
        internalType: "address",
      },
      {
        name: "depositorBtcPubKey",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "btcPopSignature",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "unsignedPrePeginTx",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "depositorSignedPeginTx",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "vaultProvider",
        type: "address",
        internalType: "address",
      },
      {
        name: "maxAcceptableCommissionBps",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "hashlock",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "htlcVout",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "referralCode",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "depositorPayoutBtcAddress",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "depositorWotsPkHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "submitPeginRequestBatch",
    inputs: [
      { name: "depositor", type: "address", internalType: "address" },
      { name: "vaultProvider", type: "address", internalType: "address" },
      {
        name: "maxAcceptableCommissionBps",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "requests",
        type: "tuple[]",
        internalType: "struct BTCVaultRegistryTypes.BatchPeginRequest[]",
        components: [
          { name: "depositorBtcPubKey", type: "bytes32", internalType: "bytes32" },
          { name: "btcPopSignature", type: "bytes", internalType: "bytes" },
          { name: "unsignedPrePeginTx", type: "bytes", internalType: "bytes" },
          { name: "depositorSignedPeginTx", type: "bytes", internalType: "bytes" },
          { name: "hashlock", type: "bytes32", internalType: "bytes32" },
          { name: "htlcVout", type: "uint8", internalType: "uint8" },
          { name: "referralCode", type: "uint32", internalType: "uint32" },
          { name: "depositorPayoutBtcAddress", type: "bytes", internalType: "bytes" },
          { name: "depositorWotsPkHash", type: "bytes32", internalType: "bytes32" },
        ],
      },
    ],
    outputs: [
      { name: "vaultIds", type: "bytes32[]", internalType: "bytes32[]" },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "activateVaultWithSecret",
    inputs: [
      {
        name: "vaultId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "activationMetadata",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPegInFee",
    inputs: [
      {
        name: "vaultProvider",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "totalFee",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultProviderBTCKey",
    inputs: [
      { name: "vpAddr", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "", type: "bytes32", internalType: "bytes32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultProviderCommission",
    inputs: [
      { name: "vpAddr", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "", type: "uint16", internalType: "uint16" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBtcVaultBasicInfo",
    inputs: [
      {
        name: "vaultId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "vBasic",
        type: "tuple",
        internalType: "struct BTCVaultTypes.BTCVaultBasicInfo",
        components: [
          { name: "depositor", type: "address", internalType: "address" },
          {
            name: "depositorBtcPubKey",
            type: "bytes32",
            internalType: "bytes32",
          },
          { name: "amount", type: "uint256", internalType: "uint256" },
          {
            name: "vaultProvider",
            type: "address",
            internalType: "address",
          },
          {
            name: "status",
            type: "uint8",
            internalType: "enum IBTCVaultRegistry.BTCVaultStatus",
          },
          {
            name: "applicationEntryPoint",
            type: "address",
            internalType: "address",
          },
          { name: "createdAt", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "error",
    name: "InvalidPeginFee",
    inputs: [
      {
        name: "provided",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "required",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidSecret",
    inputs: [],
  },
  {
    type: "error",
    name: "ActivationDeadlineExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidHashlock",
    inputs: [],
  },
  {
    type: "error",
    name: "DuplicateHashlock",
    inputs: [],
  },
  {
    type: "error",
    name: "CapExceeded",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidOutputIndex",
    inputs: [],
  },
  {
    type: "error",
    name: "PeginSignaturesIncomplete",
    inputs: [],
  },
  {
    type: "function",
    name: "getBtcVaultProtocolInfo",
    inputs: [
      {
        name: "vaultId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "vProtocol",
        type: "tuple",
        internalType:
          "struct BTCVaultRegistryTypes.BTCVaultProtocolInfo",
        components: [
          {
            name: "depositorSignedPeginTx",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "universalChallengersVersion",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "appVaultKeepersVersion",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "offchainParamsVersion",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "verifiedAt",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "depositorWotsPkHash",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "hashlock",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "htlcVout",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "depositorPopSignature",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "prePeginTxHash",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "vaultProviderCommissionBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "claimExpiredUntil",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "vaultCoreVersion",
            type: "uint16",
            internalType: "uint16",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolParams",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IProtocolParams",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "applicationRegistry",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IApplicationRegistry",
      },
    ],
    stateMutability: "view",
  },
  // ============================================================================
  // Errors — needed so viem can decode revert data into a named error.
  // Without these, every revert surfaces as "Execution reverted for an
  // unknown reason." Mirrors errors thrown from BTCVaultRegistry's reachable
  // code paths (pegin submission, ACK, activation). Source:
  // ~/babylon/vault/vault-contracts-aave-v4/src/protocol/lib/types/Errors.sol
  // ============================================================================
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "Unauthorized", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "InvalidTransaction", inputs: [] },
  { type: "error", name: "EmptyPayoutAddress", inputs: [] },
  { type: "error", name: "PayoutAddressTooLong", inputs: [] },
  { type: "error", name: "VaultAlreadyExists", inputs: [] },
  { type: "error", name: "VaultFeeAlreadyEscrowed", inputs: [] },
  { type: "error", name: "NoEscrowedFees", inputs: [] },
  { type: "error", name: "BTCVaultNotFound", inputs: [] },
  { type: "error", name: "InvalidBTCVaultStatus", inputs: [] },
  { type: "error", name: "PeginNotExpired", inputs: [] },
  { type: "error", name: "InvalidParticipantsList", inputs: [] },
  { type: "error", name: "DuplicateParticipant", inputs: [] },
  { type: "error", name: "ParticipantRoleOverlap", inputs: [] },
  { type: "error", name: "NotAuthorizedToACK", inputs: [] },
  { type: "error", name: "UnauthorizedVaultKeeper", inputs: [] },
  { type: "error", name: "BlocklistedVaultKeeper", inputs: [] },
  { type: "error", name: "PeginTransactionExpired", inputs: [] },
  { type: "error", name: "PrePeginOutputAlreadyUsed", inputs: [] },
  { type: "error", name: "PeginTransactionAlreadyUsed", inputs: [] },
  {
    type: "error",
    name: "InvalidPeginFee",
    inputs: [
      { name: "provided", type: "uint256", internalType: "uint256" },
      { name: "required", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AmountBelowMinimumThreshold",
    inputs: [
      { name: "actual", type: "uint256", internalType: "uint256" },
      { name: "minimum", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidOutputIndex",
    inputs: [
      { name: "provided", type: "uint256", internalType: "uint256" },
      { name: "maxValid", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "TooManyHtlcOutputs",
    inputs: [
      { name: "outputCount", type: "uint256", internalType: "uint256" },
      { name: "maxAllowed", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "VaultBelowMinimum",
    inputs: [
      { name: "actual", type: "uint256", internalType: "uint256" },
      { name: "minimum", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "error",
    name: "VaultAboveMaximum",
    inputs: [
      { name: "actual", type: "uint256", internalType: "uint256" },
      { name: "maximum", type: "uint256", internalType: "uint256" },
    ],
  },
  { type: "error", name: "InvalidBTCPublicKey", inputs: [] },
  { type: "error", name: "InvalidDepositorWotsPkHash", inputs: [] },
  { type: "error", name: "InvalidBTCProofOfPossession", inputs: [] },
  { type: "error", name: "EthKeyAlreadyRegistered", inputs: [] },
  { type: "error", name: "BtcKeyAlreadyRegistered", inputs: [] },
  { type: "error", name: "InvalidRegistrationFee", inputs: [] },
  {
    type: "error",
    name: "CommissionBelowMinimum",
    inputs: [
      { name: "provided", type: "uint16", internalType: "uint16" },
      { name: "minimum", type: "uint16", internalType: "uint16" },
    ],
  },
  {
    type: "error",
    name: "CommissionAboveMaximum",
    inputs: [{ name: "provided", type: "uint16", internalType: "uint16" }],
  },
  { type: "error", name: "CommissionUnchanged", inputs: [] },
  {
    type: "error",
    name: "VaultProviderCommissionExceeded",
    inputs: [
      { name: "maxAcceptable", type: "uint16", internalType: "uint16" },
      { name: "actual", type: "uint16", internalType: "uint16" },
    ],
  },
  { type: "error", name: "VaultProviderNotRegistered", inputs: [] },
  { type: "error", name: "ApplicationAlreadyRegistered", inputs: [] },
  { type: "error", name: "ApplicationNotRegistered", inputs: [] },
  { type: "error", name: "ApplicationNotActive", inputs: [] },
  { type: "error", name: "InvalidApplicationStatus", inputs: [] },
  { type: "error", name: "OnlyApplicationEntryPoint", inputs: [] },
  { type: "error", name: "EmptyVaultKeepers", inputs: [] },
  { type: "error", name: "NoUniversalChallengersConfigured", inputs: [] },
  { type: "error", name: "NoAppVaultKeepersConfigured", inputs: [] },
  { type: "error", name: "PeginSignaturesIncomplete", inputs: [] },
  { type: "error", name: "InvalidSignatureLength", inputs: [] },
  { type: "error", name: "PeginInputSignatureAlreadySubmitted", inputs: [] },
  { type: "error", name: "InvalidHashlock", inputs: [] },
  { type: "error", name: "DuplicateHashlock", inputs: [] },
  { type: "error", name: "InvalidSecret", inputs: [] },
  { type: "error", name: "ActivationDeadlineExpired", inputs: [] },
  { type: "error", name: "PostExpiryGraceWindowElapsed", inputs: [] },
  { type: "error", name: "CapExceeded", inputs: [] },
] as const;
