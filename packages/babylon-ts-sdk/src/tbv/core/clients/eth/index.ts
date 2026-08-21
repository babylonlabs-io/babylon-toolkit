export {
  resolveProtocolAddresses,
  type ProtocolAddresses,
} from "./contract-address-resolver";
export { assertOnChainBtcPubkey } from "./onChainBtcPubkey";
export {
  ViemOperationKeyReader,
  type OperationKeyContracts,
} from "./operation-key-reader";
export {
  ViemPeginRegistrationClient,
} from "./pegin-registration-client";
export type {
  BatchPeginRegistrationItem,
  BatchPeginRegistrationResultItem,
  PeginBatchRegistrationResult,
  PeginRegistrationResult,
  PopSignature,
  RegisterPeginBatchOnChainParams,
  RegisterPeginOnChainParams,
  ViemPeginRegistrationClientConfig,
} from "./pegin-registration-client";
export { calculatePeginTxHash, derivePeginVaultId } from "./pegin-transaction";
export { ViemProtocolParamsReader } from "./protocol-params-reader";
export {
  validateOffchainParams,
  validatePegInConfiguration,
  validateTBVProtocolParams,
} from "./protocol-params-validation";
// Pure validation used by ETH registry readers; re-exported here so callers
// do not need the broad core/primitives barrel merely to validate uint16 data.
export { assertValidVaultCoreVersion } from "../../primitives/vaultCoreVersion";
export {
  ViemUniversalChallengerReader,
  ViemVaultKeeperReader,
} from "./signer-set-reader";
export { OnChainBtcVaultStatus } from "./types";
export type {
  AddressBTCKeyPair,
  AllOffchainParamsData,
  KeyEpochs,
  OnChainBtcPubkey,
  OnSkippedOffchainParamsVersion,
  OperationKeyQuery,
  OperationKeyReader,
  PegInConfiguration,
  ProtocolParamsReader,
  RawOperationKeys,
  RawPayoutScripts,
  TBVProtocolParams,
  UniversalChallengerReader,
  VaultBasicInfo,
  VaultData,
  VaultKeeperReader,
  VaultProtocolInfo,
  VaultRegistryReader,
  VersionedOffchainParams,
} from "./types";
export { ViemVaultRegistryReader } from "./vault-registry-reader";
