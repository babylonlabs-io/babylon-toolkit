/**
 * Single bridge to the wallet-connector E2E harness.
 *
 * Those files are test-only and NOT exposed in the connector package's `exports`, so we import them by
 * relative path (resolved by tsx, which handles extensionless cross-package .ts imports). Keeping every
 * cross-package path here means a move only touches this one file. Run via `pnpm exec tsx` — see the
 * `e2e:cli` script.
 */
export {
  launchWalletContext,
  type SupportedWallet,
} from "../../../../packages/babylon-wallet-connector/tests/e2e/fixtures/launch";
export { setupMetaMaskWallet } from "../../../../packages/babylon-wallet-connector/tests/e2e/fixtures/wallets/metamask";
export { setupOKXWallet } from "../../../../packages/babylon-wallet-connector/tests/e2e/fixtures/wallets/okx";
export { setupOneKeyWallet } from "../../../../packages/babylon-wallet-connector/tests/e2e/fixtures/wallets/onekey";
export { setupUnisatWallet } from "../../../../packages/babylon-wallet-connector/tests/e2e/fixtures/wallets/unisat";
export { deriveEthAddress } from "../../../../packages/babylon-wallet-connector/tests/e2e/setup/eth";
export { deriveSignetTaproot } from "../../../../packages/babylon-wallet-connector/tests/e2e/setup/taproot";
export { addrMatches } from "../../../../packages/babylon-wallet-connector/tests/e2e/utils/walletUi";
