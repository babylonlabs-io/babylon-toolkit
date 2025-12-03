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
    stateMutability: "nonpayable",
  },
] as const;

