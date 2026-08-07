/**
 * Vault activation service — reveal HTLC secret on Ethereum.
 *
 * @module services/activation
 */

export {
  activateVault,
  activateVaultAndRedeem,
  type ActivateVaultAndRedeemInput,
  type ActivateVaultInput,
  type EthContractWriteCall,
  type EthContractWriteResult,
  type EthContractWriter,
} from "./activateVault";
