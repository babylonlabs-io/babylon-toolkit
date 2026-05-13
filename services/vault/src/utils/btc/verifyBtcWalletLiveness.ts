import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

export class BtcWalletLivenessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtcWalletLivenessError";
  }
}

const UNRESPONSIVE_MESSAGE =
  "Your BTC wallet is not responding. Please open your wallet extension to confirm it is unlocked and connected, then try again.";

const EMPTY_ADDRESS_MESSAGE =
  "Your BTC wallet did not return an address. Please reconnect your wallet and try again.";

const ADDRESS_MISMATCH_MESSAGE =
  "Your BTC wallet account has changed. Please reconnect your wallet and try again.";

export async function verifyBtcWalletLiveness(
  wallet: BitcoinWallet,
  expectedAddress: string,
): Promise<void> {
  let observedAddress: string;
  try {
    const [addressResult] = await Promise.all([
      wallet.getAddress(),
      wallet.getNetwork(),
    ]);
    observedAddress = addressResult;
  } catch {
    throw new BtcWalletLivenessError(UNRESPONSIVE_MESSAGE);
  }

  if (!observedAddress) {
    throw new BtcWalletLivenessError(EMPTY_ADDRESS_MESSAGE);
  }

  if (observedAddress !== expectedAddress) {
    throw new BtcWalletLivenessError(ADDRESS_MISMATCH_MESSAGE);
  }
}
