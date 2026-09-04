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
      // Appended last on both singular overloads, unlike the batch entry where
      // it sits before `requests`. Order is the signature, so it is the ABI.
      {
        name: "expectedFingerprint",
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
      {
        name: "expectedFingerprint",
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
      // The fingerprint is argument 4, BEFORE `requests` — not appended, as it
      // is on the two singular overloads. It takes no per-request input and the
      // batch fixes one vault provider, so one value covers every entry.
      {
        name: "expectedFingerprint",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "requests",
        type: "tuple[]",
        internalType: "struct BTCVaultRegistryTypes.BatchPeginRequest[]",
        components: [
          {
            name: "depositorBtcPubKey",
            type: "bytes32",
            internalType: "bytes32",
          },
          { name: "btcPopSignature", type: "bytes", internalType: "bytes" },
          { name: "unsignedPrePeginTx", type: "bytes", internalType: "bytes" },
          {
            name: "depositorSignedPeginTx",
            type: "bytes",
            internalType: "bytes",
          },
          { name: "hashlock", type: "bytes32", internalType: "bytes32" },
          { name: "htlcVout", type: "uint8", internalType: "uint8" },
          { name: "referralCode", type: "uint32", internalType: "uint32" },
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
    name: "activateVaultWithSecretAndRedeem",
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
  // --- RFC-006 operation-key resolution ---------------------------------
  // A vault provider's BTC key is not a fixed registration key: it is an
  // append-only history of *operation* keys, rotated by the provider's cold ETH
  // admin key. Each vault freezes a `vpKeyEpoch` at `submitPeginRequest` and
  // resolves the key bonded at that epoch, so a later rotation never
  // invalidates a live vault.
  //
  // The dedicated `getVaultProviderBTCKey` / `getVaultProviderKeyPair` getters
  // are deliberately absent: vault-contracts-aave-v4#539 removes them, and
  // keeping them here would let a call compile against a selector the registry
  // no longer exposes. The registration key is read as the operation key at
  // epoch 0 instead — see `getVaultProviderGenesisBtcPubKey`.
  //
  // `getCurrentOperationBtcKey` falls back on-chain to the registration key at
  // version 0, so adopting it is a no-op for a provider that never rotated.
  //
  // `getPayoutScriptAtEpoch` does NOT behave that way, and assuming it did was
  // wrong in an earlier revision of this comment. A payout script is mandatory
  // at registration and stored as version 1, so on an RFC-006 registry this
  // returns the operator's own registered script from the very first epoch —
  // not a BIP-86 derivation of its key. The contract's BIP-86 branch is a
  // migration default for pre-RFC-006 rows and is not reachable from
  // registration. An operator whose registered script happens to equal
  // bip86(key) is a coincidence of what it chose to register, not a fallback.
  //
  // This is why depositor payout validation must accept the legacy BIP-86 form
  // alongside the registered one: a payout graph is built once at BaBe Setup
  // and never rebuilt, so a vault whose graph predates its network's
  // btc-vault#2440 upgrade pays BIP-86 for the rest of its life. See
  // `acceptedPayoutScriptHexes` in `primitives/psbt/payout.ts`.
  {
    type: "function",
    name: "getCurrentOperationBtcKey",
    inputs: [{ name: "provider", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperationBtcKeyAtEpoch",
    inputs: [
      { name: "provider", type: "address", internalType: "address" },
      { name: "epoch", type: "uint64", internalType: "uint64" },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPayoutScriptAtEpoch",
    inputs: [
      { name: "provider", type: "address", internalType: "address" },
      { name: "epoch", type: "uint64", internalType: "uint64" },
    ],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultProviderCommission",
    inputs: [{ name: "vpAddr", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultProviderApplication",
    inputs: [{ name: "vpAddr", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
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
        internalType: "struct BTCVaultRegistryTypes.BTCVaultProtocolInfo",
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
  // https://github.com/babylonlabs-io/vault-contracts-aave-v4/blob/652c4582/src/protocol/lib/types/Errors.sol
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
  // The same intent-binding shape as VaultProviderCommissionExceeded above,
  // one axis wider: the depositor commits to the whole protocol resolution the
  // Pre-Pegin was built against, and the registry rejects a submission whose
  // resolution moved. Newer than the block header's source commit — it arrives
  // with https://github.com/babylonlabs-io/vault-contracts-aave-v4/pull/555,
  // read at head ec62ac62.
  {
    type: "error",
    name: "PeginFingerprintChanged",
    inputs: [
      { name: "expected", type: "bytes32", internalType: "bytes32" },
      { name: "actual", type: "bytes32", internalType: "bytes32" },
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
  // Lower bound on activation: reverts while
  // `block.number < verifiedAt + peginActivationDelay`. Clears with time, so
  // unlike ActivationDeadlineExpired it is retryable, not terminal.
  { type: "error", name: "ActivationDelayNotElapsed", inputs: [] },
  { type: "error", name: "PostExpiryGraceWindowElapsed", inputs: [] },
  { type: "error", name: "CapExceeded", inputs: [] },
] as const;
