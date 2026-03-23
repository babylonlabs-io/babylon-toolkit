/**
 * BTCVaultsManager Contract ABI
 *
 * Minimal ABI containing only the functions needed by the SDK.
 * Full ABI is available in the vault service package.
 *
 * @module contracts/abis/BTCVaultsManager
 */

/**
 * Minimal ABI for BTCVaultsManager contract.
 * Contains submitPeginRequest, activateVaultWithSecret, getPegInFee, and getBTCVault.
 */
export const BTCVaultsManagerABI = [
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
        name: "depositorPayoutBtcAddress",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "depositorLamportPkHash",
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
        name: "depositorLamportPkHash",
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
    name: "getBTCVault",
    inputs: [
      {
        name: "vaultId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "vault",
        type: "tuple",
        internalType: "struct IBTCVaultsManager.BTCVault",
        components: [
          { name: "depositor", type: "address", internalType: "address" },
          { name: "depositorBtcPubKey", type: "bytes32", internalType: "bytes32" },
          { name: "depositorSignedPeginTx", type: "bytes", internalType: "bytes" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "vaultProvider", type: "address", internalType: "address" },
          { name: "status", type: "uint8", internalType: "enum IBTCVaultsManager.BTCVaultStatus" },
          { name: "applicationController", type: "address", internalType: "address" },
          { name: "universalChallengersVersion", type: "uint16", internalType: "uint16" },
          { name: "appVaultKeepersVersion", type: "uint16", internalType: "uint16" },
          { name: "offchainParamsVersion", type: "uint16", internalType: "uint16" },
          { name: "vkVersion", type: "uint16", internalType: "uint16" },
          { name: "createdAt", type: "uint256", internalType: "uint256" },
          { name: "verifiedAt", type: "uint256", internalType: "uint256" },
          { name: "depositorLamportPkHash", type: "bytes32", internalType: "bytes32" },
          { name: "hashlock", type: "bytes32", internalType: "bytes32" },
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
] as const;
