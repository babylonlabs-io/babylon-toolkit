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
 * Contains submitPeginRequest, submitPeginRequestBatch, activateVaultWithSecret, getPegInFee, and getBtcVaultBasicInfo.
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
        name: "requests",
        type: "tuple[]",
        internalType: "struct IBTCVaultRegistry.BatchPeginRequest[]",
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
    name: "getBtcVaultBasicInfo",
    inputs: [
      {
        name: "vaultId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      { name: "depositor", type: "address", internalType: "address" },
      { name: "depositorBtcPubKey", type: "bytes32", internalType: "bytes32" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "vaultProvider", type: "address", internalType: "address" },
      { name: "status", type: "uint8", internalType: "enum IBTCVaultRegistry.BTCVaultStatus" },
      { name: "applicationEntryPoint", type: "address", internalType: "address" },
      { name: "createdAt", type: "uint256", internalType: "uint256" },
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
        name: "depositorSignedPeginTx",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "universalChallengersVersion",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "appVaultKeepersVersion",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "offchainParamsVersion",
        type: "uint32",
        internalType: "uint32",
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
    ],
    stateMutability: "view",
  },
] as const;
