/**
 * ApplicationRegistry Contract ABI
 *
 * Minimal ABI containing only the vault keeper read functions needed by the SDK.
 * Generated from vault-contracts-aave-v4 IApplicationRegistry.sol interface.
 *
 * @module contracts/abis/ApplicationRegistry
 */

export const ApplicationRegistryABI = [
  {
    type: "function",
    name: "getVaultKeepersByVersion",
    inputs: [
      {
        name: "appEntryPoint",
        type: "address",
        internalType: "address",
      },
      {
        name: "versionNumber",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct BTCVaultTypes.AddressBTCKeyPair[]",
        components: [
          {
            name: "ethAddress",
            type: "address",
            internalType: "address",
          },
          {
            name: "btcPubKey",
            type: "bytes32",
            internalType: "bytes32",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCurrentVaultKeepers",
    inputs: [
      {
        name: "appEntryPoint",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct BTCVaultTypes.AddressBTCKeyPair[]",
        components: [
          {
            name: "ethAddress",
            type: "address",
            internalType: "address",
          },
          {
            name: "btcPubKey",
            type: "bytes32",
            internalType: "bytes32",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCurrentVaultKeepersVersion",
    inputs: [
      {
        name: "appEntryPoint",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
] as const;
