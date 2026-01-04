/**
 * Smart Contract ABIs and Error Handling
 *
 * Contract ABIs used by the SDK for encoding transaction data,
 * and utilities for handling contract errors.
 *
 * @module contracts
 */

export { BTCVaultsManagerABI } from "./abis/BTCVaultsManager.abi";

export {
  CONTRACT_ERRORS,
  extractErrorData,
  getContractErrorMessage,
  isKnownContractError,
  handleContractError,
} from "./errors";

