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
 * Contains only submitPeginRequest function used by PeginManager.
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
        name: "unsignedPegInTx",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "vaultProvider",
        type: "address",
        internalType: "address",
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
          { name: "unsignedPegInTx", type: "bytes", internalType: "bytes" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "vaultProvider", type: "address", internalType: "address" },
          { name: "status", type: "uint8", internalType: "enum IBTCVaultsManager.BTCVaultStatus" },
          { name: "applicationController", type: "address", internalType: "address" },
          { name: "universalChallengersVersion", type: "uint16", internalType: "uint16" },
          { name: "appVaultKeepersVersion", type: "uint16", internalType: "uint16" },
          { name: "offchainParamsVersion", type: "uint16", internalType: "uint16" },
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
] as const;

