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
  // --- RFC-006 operation-key resolution ---------------------------------
  // A keeper's roster entry (`AddressBTCKeyPair` above) carries its *admin*
  // ETH address and its *genesis* BTC key. The key that actually goes into
  // the scripts is the operation key bonded at the vault's frozen
  // `appKeeperKeyEpoch`, which the admin address keys the lookup for.
  //
  // The `...OrGenesis` variant takes the roster key explicitly because the
  // correct genesis for a keeper is its key in the vault's *frozen membership
  // version* — a keeper may have been dropped from the current roster, or
  // listed under a different key in an older version. The plain
  // `getOperationBtcKeyAtEpoch` variant resolves genesis version-agnostically
  // and can therefore pick the wrong one; do not use it for a frozen vault.
  {
    type: "function",
    name: "getCurrentOperationBtcKey",
    inputs: [
      { name: "appEntryPoint", type: "address", internalType: "address" },
      { name: "keeperAdmin", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperationBtcKeyAtEpochOrGenesis",
    inputs: [
      { name: "appEntryPoint", type: "address", internalType: "address" },
      { name: "keeperAdmin", type: "address", internalType: "address" },
      { name: "epoch", type: "uint64", internalType: "uint64" },
      { name: "rosterGenesisKey", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPayoutScriptAtEpoch",
    inputs: [
      { name: "appEntryPoint", type: "address", internalType: "address" },
      { name: "keeperAdmin", type: "address", internalType: "address" },
      { name: "epoch", type: "uint64", internalType: "uint64" },
    ],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
] as const;
