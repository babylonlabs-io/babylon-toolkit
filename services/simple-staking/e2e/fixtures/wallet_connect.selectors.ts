export const CONNECT_BUTTON_SELECTOR =
  'button[data-testid="connect-wallets-button"]:enabled';

export const DIALOG_SELECTORS = {
  ERROR_DIALOG: '[data-testid="error-dialog"]',
  ERROR_DIALOG_DONE_BUTTON:
    '[data-testid="error-dialog"] [data-testid="error-continue-button"]',
};

export const BUTTON_SELECTORS = {
  DONE: '[data-testid="chains-connect-button"]',
};

export const WALLET_SELECTORS = {
  BITCOIN: '[data-testid="select-bitcoin-wallet-button"]',
  OKX: [
    '[data-testid="tomo-wallet-option-bitcoin_okx"]',
    '[data-testid="wallet-option-okx"]',
    'button:has-text("OKX")',
    'div[role="button"]:has-text("OKX")',
    'button:has-img[alt="OKX"]',
  ],
  BABYLON: [
    '[data-testid="select-babylon-wallet-button"]',
    'button:has-text("Select Babylon Chain Wallet")',
    'button:has-img[alt="Babylon Chain"]',
    "button:has(.bbn-avatar)",
  ],
};

export const createGenericWalletSelector = (walletType: string) =>
  `[data-testid="tomo-wallet-option-cosmos_${walletType.toLowerCase()}"]`;
