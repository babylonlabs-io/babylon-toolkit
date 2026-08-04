/**
 * BTCVaultRegistry ABI — RFC-006 key-epoch view of `getBtcVaultProtocolInfo`.
 *
 * This is a deliberate second copy of a single function entry, NOT a
 * convenience re-export, and it must never be merged into
 * `BTCVaultRegistryABI`.
 *
 * `getBtcVaultProtocolInfo` returns a *positional* tuple. RFC-006 appended
 * three `uint64` epoch fields (`vpKeyEpoch`, `appKeeperKeyEpoch`,
 * `ucKeyEpoch`) after `vaultCoreVersion`. Declaring those three components
 * against a registry that predates RFC-006 makes viem read past the end of
 * the returndata and throw — and because the shared reader batches this call
 * through `multicall({ allowFailure: false })`, one bad decode fails the
 * whole batch. That would break vault status, resume, payout and refund
 * app-wide, on every network whose registry has not been upgraded yet.
 *
 * So the shared `BTCVaultRegistryABI` keeps the 13-field shape that decodes
 * against every deployed registry, and the extended shape lives here, read
 * only by `ViemVaultRegistryReader.getVaultKeyEpochs*` on the epoch-aware
 * path. Reading the same call through two ABIs is the price of keeping the
 * shared decode path independent of the registry version.
 *
 * The 13 shared components must stay an exact prefix of the 16 below;
 * `__tests__/abi-key-epochs.test.ts` pins that.
 *
 * Generated from vault-contracts-aave-v4
 * `src/protocol/lib/types/BTCVaultRegistryTypes.sol`.
 *
 * @module contracts/abis/BTCVaultRegistryKeyEpochs
 */

export const BTCVaultRegistryKeyEpochsABI = [
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
          // RFC-006: per-pegin operation-key epochs, frozen at
          // `submitPeginRequest`. All three pack into one storage slot and were
          // appended after `vaultCoreVersion` so pre-existing rows decode
          // unchanged.
          {
            name: "vpKeyEpoch",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "appKeeperKeyEpoch",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "ucKeyEpoch",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;
