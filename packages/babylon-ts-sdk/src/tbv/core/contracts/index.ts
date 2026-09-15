/**
 * Smart Contract ABIs and Error Handling
 *
 * Contract ABIs used by the SDK for encoding transaction data,
 * and utilities for handling contract errors.
 *
 * @module contracts
 */

export { ApplicationRegistryABI } from "./abis/ApplicationRegistry.abi";
export { BTCVaultRegistryABI } from "./abis/BTCVaultRegistry.abi";
export { BTCVaultRegistryKeyEpochsABI } from "./abis/BTCVaultRegistryKeyEpochs.abi";
export { ProtocolParamsABI } from "./abis/ProtocolParams.abi";

export {
  CONTRACT_ERRORS,
  PEGIN_FINGERPRINT_CHANGED_SELECTOR,
  PeginFingerprintChangedError,
  extractErrorData,
  getContractErrorMessage,
  handleContractError,
  isKnownContractError,
  isPeginFingerprintChangedError,
} from "./errors";
