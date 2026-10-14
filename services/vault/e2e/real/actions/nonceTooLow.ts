/**
 * `--inject-nonce-too-low`: make the wallet answer the borrow send with "nonce too low", to exercise the
 * app's stale-nonce retry (`sendWithStaleNonceRetry` in src/clients/eth-contract/walletNonce.ts) on
 * real Sepolia with the real MetaMask. The two answers a wallet can give are indistinguishable by their
 * error class alone, and the app must tell them apart by the nonce the refusal names:
 *
 *   - `stale`: the wallet signed with a nonce an earlier transaction already used, and its node refused
 *     it before broadcast. The first borrow send is never forwarded to MetaMask; it is answered with a
 *     refusal naming the nonce just below the account's count. The app must send once more, so the run
 *     expects ONE MetaMask prompt and a successful borrow.
 *   - `already-sent`: the wallet broadcast the borrow, then reported "nonce too low" for that same
 *     transaction (MetaMask does this when it re-broadcasts a send whose answer it lost and the retry
 *     reaches a node that has already counted it). The borrow is forwarded, approved and broadcast,
 *     then answered with a refusal naming its own nonce. The app must NOT send again, nor call it a
 *     failure: the run expects the outcome-unknown notice while the one broadcast borrow still mines.
 *   - `already-sent-fallback`: the same, from a wallet that passes the node's code -32000 on and also
 *     serves `wallet_sendTransaction`. viem answers a -32000 send by sending the same request again as
 *     `wallet_sendTransaction`, inside the app's one `send()`; this wallet takes it, relaying it to
 *     MetaMask as a second real borrow. The app must keep viem from sending it, so the run expects the
 *     outcome-unknown notice and no resend.
 *   - `stale-then-already-sent`: `stale` for the first borrow send, then `already-sent` for the app's
 *     retry. The retry is a new transaction the wallet broadcast, so the run expects the
 *     outcome-unknown notice, not a failure, and no third send.
 *
 * Every mode requires the account to end up exactly one transaction further on chain — two would be a
 * duplicate borrow — which `assertAccountSentOnce` checks after a settle window.
 *
 * The refusal is worded as MetaMask passes geth's text on ("RPC 0xaa36a7 Infura eth_sendRawTransaction:
 * nonce too low: next nonce N, tx nonce M"), with MetaMask's code -32603 (-32000 for
 * `already-sent-fallback`).
 *
 * Mechanism: the page-side script wraps `request` on MetaMask's EIP-6963 provider (rdns `io.metamask`) —
 * the object wagmi's injected connector hands viem's `custom` transport, which binds `request` when the
 * connector client is created after connect, so the wrapper must be in place before connecting. It
 * touches only `eth_sendTransaction` to the Aave adapter with the borrow selector: the first one in
 * every mode, and the app's retry too in `stale-then-already-sent`. In `already-sent-fallback` it also
 * takes the borrow as `wallet_sendTransaction` after its refusal, relaying it to MetaMask. Every other
 * request (connect, chain switch, count reads, and the retry's send in `stale`) goes to MetaMask
 * unchanged.
 */
import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Page } from "@playwright/test";
import { type Abi, type Address, getAbiItem, toFunctionSelector } from "viem";

import { type NetworkName, type NonceTooLowInjection } from "../config";
import { createEthClient, resolveNetworkContracts } from "../networkContracts";
import {
  MS_PER_SECOND,
  NONCE_INJECTION_COUNT_SETTLE_TIMEOUT_MS,
  NONCE_INJECTION_POLL_MS,
  NONCE_INJECTION_SETTLE_MS,
  NONCE_INJECTION_TIMEOUT_MS,
} from "../timing";

/** What the page-side wrapper did, reported once per run through the exposed binding. */
type InjectionEvent =
  | { kind: "patched" }
  | {
      kind: "refused";
      mode: NonceTooLowInjection;
      nonce: number;
      nextNonce: number;
      hash?: string;
    }
  | { kind: "resent" }
  | { kind: "error"; message: string };

export interface NonceInjectionProbe {
  /** Rejects unless MetaMask's provider was wrapped — call before submitting the borrow. */
  assertPatched(): Promise<void>;
  /**
   * Wait until MetaMask's node and the app's RPC count the same transactions for the account, and
   * return that count — the baseline "exactly one transaction" is measured against. The app retries a
   * stale nonce only when the two agree, and a stale refusal names MetaMask's count minus one, so a
   * run started while they differ would fail for the environment, not the app. Throws, naming both
   * counts, when they do not agree in time.
   */
  settledCount(ethAddress: string): Promise<number>;
  /** True once the wrapper has answered a borrow send with its refusal. */
  refused(): boolean;
  /** Waits for the wrapper to answer the borrow send, and returns what it answered. */
  waitForRefusal(): Promise<Extract<InjectionEvent, { kind: "refused" }>>;
  /** Throws if the borrow reached the wallet again as `wallet_sendTransaction` after the refusal. */
  assertNotResent(): void;
}

/**
 * Page-side source. A raw string for the same reason as recording.ts's SIGNING_CAPTURE_SOURCE: tsx's
 * keepNames helper would be undefined in the page. `__MODE__`, `__TARGET__` and `__SELECTOR__` are
 * replaced with JSON literals before injection.
 */
const INJECTION_SOURCE = `(() => {
  if (window.__e2eNonceInjectionHooked) return;
  window.__e2eNonceInjectionHooked = true;
  var MODE = __MODE__;
  var TARGET = __TARGET__;
  var SELECTOR = __SELECTOR__;
  var METAMASK_RDNS = "io.metamask";
  var METAMASK_INTERNAL_ERROR_CODE = -32603;
  var NODE_INVALID_INPUT_ERROR_CODE = -32000;
  var REFUSAL_PREFIX = "RPC 0xaa36a7 Infura eth_sendRawTransaction: ";
  var HASH_READ_ATTEMPTS = 20;
  var HASH_READ_DELAY_MS = 500;
  var DISCOVERY_INTERVAL_MS = 250;
  var armed = true;
  var patched = false;
  var borrowSends = 0;
  // The binding answers asynchronously, so a failed report is kept here for the
  // runner to read when an expected event never arrives.
  var reportFailures = [];
  window.__e2eNonceInjectionReportFailures = reportFailures;
  function report(entry) {
    Promise.resolve()
      .then(function () { return window.__e2eNonceInjection(JSON.stringify(entry)); })
      .catch(function (error) {
        reportFailures.push(entry.kind + ": " + String(error && error.message ? error.message : error));
      });
  }
  function refusal(nextNonce, nonce) {
    var error = new Error(REFUSAL_PREFIX + "nonce too low: next nonce " + nextNonce + ", tx nonce " + nonce);
    error.code = MODE === "already-sent-fallback" ? NODE_INVALID_INPUT_ERROR_CODE : METAMASK_INTERNAL_ERROR_CODE;
    error.injected = true;
    return error;
  }
  function isBorrowCall(args, method) {
    if (!args || args.method !== method) return false;
    var tx = args.params && args.params[0];
    return !!tx && typeof tx.to === "string" && tx.to.toLowerCase() === TARGET &&
      typeof tx.data === "string" && tx.data.toLowerCase().indexOf(SELECTOR) === 0;
  }
  async function nonceOf(request, hash) {
    for (var i = 0; i < HASH_READ_ATTEMPTS; i++) {
      var tx = await request({ method: "eth_getTransactionByHash", params: [hash] });
      if (tx && typeof tx.nonce === "string") return parseInt(tx.nonce, 16);
      await new Promise(function (r) { setTimeout(r, HASH_READ_DELAY_MS); });
    }
    throw new Error("could not read the nonce of " + hash);
  }
  async function answer(original, args) {
    borrowSends += 1;
    var staleNow = MODE === "stale" || (MODE === "stale-then-already-sent" && borrowSends === 1);
    if (MODE !== "stale-then-already-sent" || borrowSends > 1) armed = false;
    var from = args.params[0].from;
    if (staleNow) {
      var count = parseInt(await original({ method: "eth_getTransactionCount", params: [from, "latest"] }), 16);
      if (!(count > 0)) throw new Error("account has sent no transaction, so no nonce below its count");
      report({ kind: "refused", mode: MODE, nonce: count - 1, nextNonce: count });
      throw refusal(count, count - 1);
    }
    var hash = await original(args);
    var nonce = await nonceOf(original, hash);
    report({ kind: "refused", mode: MODE, nonce: nonce, nextNonce: nonce + 1, hash: hash });
    throw refusal(nonce + 1, nonce);
  }
  function patch(provider) {
    if (patched || !provider || typeof provider.request !== "function") return;
    var original = provider.request.bind(provider);
    provider.request = function (args) {
      if (MODE === "already-sent-fallback" && !armed && isBorrowCall(args, "wallet_sendTransaction")) {
        report({ kind: "resent" });
        return original({ method: "eth_sendTransaction", params: args.params });
      }
      if (!armed || !isBorrowCall(args, "eth_sendTransaction")) return original(args);
      return answer(original, args).catch(function (error) {
        if (error && error.injected) throw error;
        report({ kind: "error", message: String(error && error.message ? error.message : error) });
        throw error;
      });
    };
    // MetaMask's own count for the account, as the app's wallet-side read sees it.
    window.__e2eNonceInjectionWalletCount = function (address) {
      return original({ method: "eth_getTransactionCount", params: [address, "latest"] })
        .then(function (hex) { return parseInt(hex, 16); });
    };
    patched = true;
    report({ kind: "patched" });
  }
  window.addEventListener("eip6963:announceProvider", function (event) {
    var detail = event.detail;
    if (detail && detail.info && detail.info.rdns === METAMASK_RDNS) patch(detail.provider);
  });
  var discovery = setInterval(function () {
    if (patched) { clearInterval(discovery); return; }
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }, DISCOVERY_INTERVAL_MS);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
})()`;

/** The adapter function behind the borrow, the only send the wrapper answers. */
const BORROW_FUNCTION_NAME = "borrowFromCorePosition";

function borrowSelector(): string {
  const item = getAbiItem({
    abi: AaveIntegrationAdapterABI as Abi,
    name: BORROW_FUNCTION_NAME,
  });
  if (item?.type !== "function")
    throw new Error(
      `Nonce injection: the adapter ABI has no ${BORROW_FUNCTION_NAME} function to match the borrow send by.`,
    );
  return toFunctionSelector(item);
}

/**
 * Wrap MetaMask's provider in the dapp page (now and on every later navigation) so the next borrow
 * send is answered with "nonce too low" in `mode`. Must run before the wallets connect.
 */
export async function installNonceTooLowInjection(
  page: Page,
  network: NetworkName,
  mode: NonceTooLowInjection,
  log: (m: string) => void,
): Promise<NonceInjectionProbe> {
  const { appController } = resolveNetworkContracts(network);
  const events: InjectionEvent[] = [];
  await page.exposeFunction("__e2eNonceInjection", (json: string) => {
    const event = JSON.parse(json) as InjectionEvent;
    events.push(event);
    if (event.kind === "refused")
      log(
        `Injected "nonce too low" (${event.mode}): next nonce ${event.nextNonce}, tx nonce ${event.nonce}${event.hash ? `, broadcast as ${event.hash}` : ""}`,
      );
    if (event.kind === "resent")
      log(
        "⚠️ The borrow reached the wallet again as wallet_sendTransaction — relaying it to MetaMask as a second borrow",
      );
    if (event.kind === "error")
      log(`⚠️ Nonce injection failed in the page: ${event.message}`);
  });
  const source = INJECTION_SOURCE.replace("__MODE__", JSON.stringify(mode))
    .replace("__TARGET__", JSON.stringify(appController.toLowerCase()))
    .replace("__SELECTOR__", JSON.stringify(borrowSelector()));
  await page.addInitScript({ content: source });
  await page.evaluate(source);
  log(
    `Nonce injection armed (${mode}) for the borrow send to ${appController}`,
  );

  // Reports the page could not deliver, so a missing event names its cause.
  const undeliveredReports = async (): Promise<string> => {
    const failures = (await page.evaluate(
      "window.__e2eNonceInjectionReportFailures || []",
    )) as string[];
    return failures.length > 0
      ? ` Undelivered page reports: ${failures.join("; ")}.`
      : "";
  };

  return {
    async assertPatched() {
      if (!events.some((event) => event.kind === "patched"))
        throw new Error(
          `Nonce injection: MetaMask's EIP-6963 provider was never wrapped, so the borrow would run without the injected refusal.${await undeliveredReports()}`,
        );
    },
    async settledCount(ethAddress) {
      const deadline = Date.now() + NONCE_INJECTION_COUNT_SETTLE_TIMEOUT_MS;
      for (;;) {
        const walletCount = (await page.evaluate(
          `window.__e2eNonceInjectionWalletCount(${JSON.stringify(ethAddress)})`,
        )) as number;
        const appCount = (await readAccountNonces(network, ethAddress)).latest;
        if (walletCount === appCount) return appCount;
        if (Date.now() >= deadline)
          throw new Error(
            `Nonce injection: MetaMask counts ${walletCount} transactions for ${ethAddress} and the app's RPC counts ${appCount}, and they did not agree within ${Math.round(NONCE_INJECTION_COUNT_SETTLE_TIMEOUT_MS / MS_PER_SECOND)}s. The app retries a stale nonce only when they agree, so this run would test the environment, not the app.`,
          );
        await page.waitForTimeout(NONCE_INJECTION_POLL_MS);
      }
    },
    refused() {
      return events.some((event) => event.kind === "refused");
    },
    async waitForRefusal() {
      const deadline = Date.now() + NONCE_INJECTION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const failure = events.find((event) => event.kind === "error");
        if (failure?.kind === "error")
          throw new Error(`Nonce injection failed: ${failure.message}`);
        const refused = events.find((event) => event.kind === "refused");
        if (refused?.kind === "refused") return refused;
        await page.waitForTimeout(NONCE_INJECTION_POLL_MS);
      }
      throw new Error(
        `Nonce injection: the borrow send was not answered within ${Math.round(NONCE_INJECTION_TIMEOUT_MS / MS_PER_SECOND)}s — the app never sent it through MetaMask's wrapped provider.${await undeliveredReports()}`,
      );
    },
    assertNotResent() {
      if (events.some((event) => event.kind === "resent"))
        throw new Error(
          "DUPLICATE: viem sent the borrow again as wallet_sendTransaction after the wallet's refusal, and the wallet took it.",
        );
    },
  };
}

/** The account's transaction count from the network's RPC, mined (`latest`) and with its mempool. */
export async function readAccountNonces(
  network: NetworkName,
  ethAddress: string,
): Promise<{ latest: number; pending: number }> {
  const client = createEthClient(resolveNetworkContracts(network).ethRpcUrl);
  const address = ethAddress as Address;
  const [latest, pending] = await Promise.all([
    client.getTransactionCount({ address, blockTag: "latest" }),
    client.getTransactionCount({ address, blockTag: "pending" }),
  ]);
  return { latest, pending };
}

/**
 * The borrow must have cost the account exactly one transaction: wait for one to mine past
 * `countBefore`, then keep watching for NONCE_INJECTION_SETTLE_MS — long enough for a retry the app
 * should not send (its wallet wait, the prompt, a block) — and fail if a second one shows up, mined or
 * pending.
 */
export async function assertAccountSentOnce(
  page: Page,
  network: NetworkName,
  address: string,
  countBefore: number,
  log: (m: string) => void,
): Promise<void> {
  const expected = countBefore + 1;
  const minedBy = Date.now() + NONCE_INJECTION_TIMEOUT_MS;
  let nonces = await readAccountNonces(network, address);
  while (nonces.latest < expected && Date.now() < minedBy) {
    await page.waitForTimeout(NONCE_INJECTION_POLL_MS);
    nonces = await readAccountNonces(network, address);
  }
  if (nonces.latest < expected)
    throw new Error(
      `No transaction from ${address} mined within ${Math.round(NONCE_INJECTION_TIMEOUT_MS / MS_PER_SECOND)}s (count still ${nonces.latest}, expected ${expected}).`,
    );

  const settledBy = Date.now() + NONCE_INJECTION_SETTLE_MS;
  for (;;) {
    if (nonces.latest > expected || nonces.pending > expected)
      throw new Error(
        `DUPLICATE: ${address} sent more than one transaction for this borrow (count before ${countBefore}, now latest ${nonces.latest} / pending ${nonces.pending}).`,
      );
    if (Date.now() >= settledBy) break;
    await page.waitForTimeout(NONCE_INJECTION_POLL_MS);
    nonces = await readAccountNonces(network, address);
  }
  log(
    `✅ Exactly one transaction for this borrow: count ${countBefore} → ${nonces.latest}, nothing else pending after ${Math.round(NONCE_INJECTION_SETTLE_MS / MS_PER_SECOND)}s.`,
  );
}
