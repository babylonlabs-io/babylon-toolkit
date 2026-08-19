/**
 * ProtocolParams Contract ABI
 *
 * Minimal ABI containing only the read functions needed by the SDK.
 * Generated from vault-contracts-aave-v4 IProtocolParams.sol interface.
 *
 * @module contracts/abis/ProtocolParams
 */

export const ProtocolParamsABI = [
  {
    type: "function",
    name: "activeVaultCoreVersion",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTBVProtocolParams",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IProtocolParams.TBVProtocolParams",
        components: [
          {
            name: "minimumPegInAmount",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "maxPegInAmount",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "pegInAckTimeout",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "pegInActivationTimeout",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "maxHtlcOutputCount",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "expiredPegInGraceBlocks",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLatestOffchainParams",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IProtocolParams.VersionedOffchainParams",
        components: [
          {
            name: "timelockAssert",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "timelockChallengeAssert",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "securityCouncilKeys",
            type: "bytes32[]",
            internalType: "bytes32[]",
          },
          {
            name: "councilQuorum",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "feeRate",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "babeTotalInstances",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "babeInstancesToFinalize",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "minVpCommissionBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "tRefund",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "tStale",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "minPeginFeeRate",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "proverCircuitVersion",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "minPrepeginDepth",
            type: "uint32",
            internalType: "uint32",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOffchainParamsByVersion",
    inputs: [
      {
        name: "versionNumber",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IProtocolParams.VersionedOffchainParams",
        components: [
          {
            name: "timelockAssert",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "timelockChallengeAssert",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "securityCouncilKeys",
            type: "bytes32[]",
            internalType: "bytes32[]",
          },
          {
            name: "councilQuorum",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "feeRate",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "babeTotalInstances",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "babeInstancesToFinalize",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "minVpCommissionBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "tRefund",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "tStale",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "minPeginFeeRate",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "proverCircuitVersion",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "minPrepeginDepth",
            type: "uint32",
            internalType: "uint32",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestOffchainParamsVersion",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUniversalChallengersByVersion",
    inputs: [
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
    name: "getCurrentUniversalChallengers",
    inputs: [],
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
    name: "latestUniversalChallengersVersion",
    inputs: [],
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
  // Universal challengers get the reduced RFC-006 model: an operation key
  // that goes into the challenge scripts, resolved against the vault's frozen
  // `ucKeyEpoch`, but no payout script (a UC is never a claimer, so its only
  // BTC output is the NoPayout anchor) and no per-UC setter — key changes go
  // through a roster version bump. The roster entry's `ethAddress` is the
  // `ucAdmin` lookup key and its `btcPubKey` is the genesis key.
  {
    type: "function",
    name: "getCurrentOperationBtcKey",
    inputs: [{ name: "ucAdmin", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperationBtcKeyAtEpochOrGenesis",
    inputs: [
      { name: "ucAdmin", type: "address", internalType: "address" },
      { name: "epoch", type: "uint64", internalType: "uint64" },
      { name: "rosterGenesisKey", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  // Observation window between a vault's final ACK and its activation, in ETH
  // blocks, measured from `verifiedAt`. Read through this standalone getter
  // rather than as a 7th component of `getTBVProtocolParams` above: the field
  // was appended to the struct, so a 7-component tuple decodes only against
  // deployments that carry it and throws `PositionOutOfBoundsError` against
  // the 6-word return of those that don't. Deployments are currently split
  // (devnet has it, testnet/staging do not), and that tuple feeds
  // `getPegInConfiguration` -> `ProtocolParamsContext`, whose failure blanks
  // the app. `uint256` (not the `uint64` storage width) — the accessor widens.
  {
    type: "function",
    name: "peginActivationDelay",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;
