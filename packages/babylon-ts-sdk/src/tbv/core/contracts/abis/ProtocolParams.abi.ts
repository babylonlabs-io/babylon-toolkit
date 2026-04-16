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
            name: "proverProgramVersion",
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
            name: "proverProgramVersion",
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
] as const;
