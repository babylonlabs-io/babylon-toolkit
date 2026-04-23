/**
 * @packageDocumentation
 *
 * Wallet-owning orchestration for the vault lifecycle. A vault goes from creation
 * to `ACTIVE` through six phases — {@link https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md | Managers Quickstart}
 * walks through them. A vault at `VERIFIED` is not done: the depositor must
 * reveal the HTLC secret via `activateVault()` (services layer) or the vault
 * expires.
 *
 * | # | Phase | SDK entry point | Contract status after |
 * |---|-------|-----------------|-----------------------|
 * | 1 | Prepare Pre-PegIn + PegIn txs | `PeginManager.preparePegin()` | n/a (off-chain) |
 * | 2 | Sign BTC proof-of-possession | `PeginManager.signProofOfPossession()` | n/a (off-chain, once per session) |
 * | 3 | Register on Ethereum | `PeginManager.registerPeginOnChain()` | `PENDING` |
 * | 4 | Broadcast Pre-PegIn on Bitcoin | `PeginManager.signAndBroadcast()` | still `PENDING` until VP observes the tx |
 * | 5 | Sign payout authorisations | `pollAndSignPayouts()` (services, delegates to `PayoutManager`) | `PENDING` → `VERIFIED` |
 * | 6 | Activate by revealing HTLC secret | `activateVault()` (services) | `VERIFIED` → `ACTIVE` |
 *
 * Optional exit after the CSV timelock expires: `buildAndBroadcastRefund()` (services).
 *
 * @module managers
 */

export { PeginManager } from "./PeginManager";
export type {
  PopSignature,
  PreparePeginResult,
  PreparePeginParams,
  PeginManagerConfig,
  RegisterPeginParams,
  RegisterPeginResult,
  SignAndBroadcastParams,
  BatchPeginRequestItem,
  RegisterPeginBatchParams,
  BatchPeginResultItem,
  RegisterPeginBatchResult,
} from "./PeginManager";

export { PayoutManager } from "./PayoutManager";
export type {
  PayoutManagerConfig,
  PayoutSignatureResult,
  SignPayoutParams,
} from "./PayoutManager";

// Re-export dependent types for complete API documentation
export type { UTXO } from "../utils/utxo/selectUtxos";
export type {
  BitcoinNetwork,
  BitcoinWallet,
  SignInputOptions,
  SignPsbtOptions,
} from "../../../shared/wallets/interfaces/BitcoinWallet";
