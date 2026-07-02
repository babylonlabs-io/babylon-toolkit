/**
 * Pre-flight checks, all non-fatal (warn & proceed):
 *  - balances: derive the BTC (signet taproot) + ETH (Sepolia) addresses from the wallet mnemonic and
 *    read their balances (mempool UTXOs / eth_getBalance). Connect needs no funds, so a zero balance is
 *    only a warning — funds matter for pegin/borrow later.
 */
import { deriveEthAddress, deriveSignetTaproot } from "./connector";
import { NETWORKS, type RunConfig } from "./config";

const FETCH_TIMEOUT_MS = 10000;
const LOW_ETH_WEI = 10_000_000_000_000n; // ~0.00001 ETH — enough to warn "probably can't pay gas"
const SATS_PER_BTC = 1e8;
const BTC_DISPLAY_DECIMALS = 8;
const WEI_PER_ETH = 1e18;
const ETH_DISPLAY_DECIMALS = 6;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface BalanceReport {
  btc: { address: string; sats: bigint; error?: string };
  eth: { address: string; wei: bigint; error?: string };
}

/** Sum confirmed+unconfirmed UTXO values for the signet taproot address. */
async function btcSats(mempoolApiBase: string, address: string): Promise<bigint> {
  const res = await fetchWithTimeout(`${mempoolApiBase}/address/${address}/utxo`);
  if (!res.ok) throw new Error(`mempool ${res.status}`);
  const utxos = (await res.json()) as Array<{ value: number }>;
  return utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
}

async function ethWei(rpcUrl: string, address: string): Promise<bigint> {
  const res = await fetchWithTimeout(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return BigInt(json.result ?? "0x0");
}

export async function checkBalances(config: RunConfig, mnemonic: string): Promise<BalanceReport> {
  const net = NETWORKS[config.network];
  const btcAddress = deriveSignetTaproot(mnemonic);
  const ethAddress = deriveEthAddress(mnemonic);

  const report: BalanceReport = {
    btc: { address: btcAddress, sats: 0n },
    eth: { address: ethAddress, wei: 0n },
  };
  try {
    report.btc.sats = await btcSats(net.mempoolApiBase, btcAddress);
  } catch (e) {
    report.btc.error = e instanceof Error ? e.message : String(e);
  }
  try {
    report.eth.wei = await ethWei(net.sepoliaRpcUrl, ethAddress);
  } catch (e) {
    report.eth.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}

export const formatBtc = (sats: bigint): string =>
  `${(Number(sats) / SATS_PER_BTC).toFixed(BTC_DISPLAY_DECIMALS)} sBTC (${sats} sats)`;
export const formatEth = (wei: bigint): string =>
  `${(Number(wei) / WEI_PER_ETH).toFixed(ETH_DISPLAY_DECIMALS)} SepoliaETH`;

/** Human-readable balance warnings (empty ⇒ all good). */
export function balanceWarnings(report: BalanceReport): string[] {
  const w: string[] = [];
  if (report.btc.error) w.push(`Could not read BTC balance (${report.btc.error}).`);
  else if (report.btc.sats === 0n) w.push("BTC (signet) balance is 0 — fine for connect, but pegin will need funds.");
  if (report.eth.error) w.push(`Could not read ETH balance (${report.eth.error}).`);
  else if (report.eth.wei < LOW_ETH_WEI) w.push("Sepolia ETH balance is very low — fine for connect, but later steps need gas.");
  return w;
}
