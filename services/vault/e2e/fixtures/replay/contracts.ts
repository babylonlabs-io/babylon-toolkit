/**
 * The deployment the committed peg-in recording was captured against.
 *
 * These are not "some addresses that work". A replayed chain answers a read
 * by the address it was aimed at, so the app has to aim at the same addresses
 * the recording did or every read misses - and the app does not merely fail
 * quietly when they differ: `fetchAaveAppConfig` compares the adapter the
 * indexer reports against the configured one and throws
 * "Aave adapter mismatch" outright, which is the error boundary the capture
 * used to photograph.
 *
 * Recovered from the recording itself rather than from an `.env` file, which
 * is what keeps them honest: the devnet deployment has moved on since, so the
 * values in `.env.example` today would replay nothing. Re-recording is what
 * updates these, together.
 *
 * Provenance, so a later reader can re-derive each one:
 *  - `AAVE_ADAPTER` is the sole `applications.items[].id` in the recorded
 *    `GetApplications` response (registered as `aave-v4`).
 *  - `BTC_VAULT_REGISTRY` is `aaveConfig.btcVaultRegistryAddress` in that same
 *    response, and the other contract the recording calls `pauseState()` on.
 *  - `AAVE_ADAPTER_CONFIG` is the contract the recorded batches call
 *    `getPositionSizeParams()` on.
 *  - `BTC_PRICE_FEED` is the Chainlink feed the recorded batches read
 *    `latestRoundData()` / `decimals()` from.
 *  - `ETH_CHAIN_ID` is Sepolia, the chain every recorded `eth_chainId`
 *    answered with.
 */

export const RECORDED_DEPLOYMENT = {
  BTC_VAULT_REGISTRY: "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
  AAVE_ADAPTER: "0x31bc43cab2d91b3016bee8e9fc1194d46d7b0590",
  AAVE_ADAPTER_CONFIG: "0x93071eef9dd7f692f377a0085dbac120324f719e",
  BTC_PRICE_FEED: "0xA5c0105B71D9D2CaDC151A1875a5B71C85AbF8DB",
  ETH_CHAIN_ID: "11155111",
} as const;

/**
 * The depositor the recording belongs to.
 *
 * The injected wallets present these so the app asks the questions the
 * recording holds answers to - a vault list, a position, a UTXO set. A
 * different address would connect fine and then render an empty dashboard,
 * which is a screenshot of nothing.
 */
export const RECORDED_DEPOSITOR = {
  BTC_ADDRESS: "tb1py5pswr46tl0y0qapun6gdm760a7rkkxcxclchu6072c3zykl7cnqjckc8a",
  /**
   * The x-only public key inside {@link RECORDED_DEPOSITOR.BTC_ADDRESS}.
   *
   * A taproot address IS its output key, so this is decoded from the address
   * rather than chosen - the co-located test re-derives it, which is what
   * keeps the pair honest if either is ever edited. It is the tweaked output
   * key, not the wallet's internal key, which the recording does not contain;
   * that difference does not reach a captured screen, and nothing in a
   * capture may sign, so it cannot reach a signature either.
   */
  BTC_X_ONLY_PUBLIC_KEY:
    "2503070eba5fde4783a1e4f486efda7f7c3b58d8363f8bf34ff2b11112dff626",
  /** Bitcoin network the recording was made on. */
  BTC_NETWORK: "signet",
  /**
   * The depositor the recorded indexer queries were asked about - it is the
   * `depositor` variable of the recorded `GetVaultsByDepositorFirstPage`, and
   * the account the recorded `eth_getBalance` was for. Connect as anyone else
   * and the vault list, the position and the balance all come back empty.
   */
  ETH_ADDRESS: "0x67158C9891FB47E0Ca719263392f4657b1C75002",
} as const;
