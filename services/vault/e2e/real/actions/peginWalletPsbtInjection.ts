/**
 * `--inject-pegin-psbt-extras`: make the BTC wallet answer the PegIn signing request with fields the dApp
 * never built beside its genuine signature: a key-path signature, its own final witness, a scriptSig,
 * and the signature filed under a leaf hash no leaf has (`addWalletPsbtExtras`). The dApp must discard
 * them and register the PegIn witness it built itself, so the deposit must still complete, and the
 * registered-witness check every pegin run makes (`assertRegisteredPeginWitness`) must still pass.
 *
 * Mechanism: the page-side script wraps the signing methods of the provider object the wallet-connector
 * signs through (`PROVIDER_HOOKS`). The connector reads each method at call time, so a swapped method is
 * the one it calls; UniSat's Proxy has no `set` trap, as the recorder's signing capture relies on. The
 * deposit's first script-path request (`autoFinalized: false`, every input signed with the untweaked
 * key) is the PegIn input's, made inside `preparePegin` before the proof of possession, the Ethereum
 * registration and the Pre-PegIn broadcast. The wrapper hands that one answer to a Node binding to
 * rewrite; the Pre-PegIn funding request (the connector's `autoFinalized: true` default) and every later
 * request reach the dApp unchanged.
 */
import type { Page } from "@playwright/test";

import { BTC_WALLETS, type BtcWalletId } from "../config";

import { addWalletPsbtExtras } from "./peginWalletPsbt";

/**
 * Where each supported wallet's connector sends a PegIn signing request on signet, the only Bitcoin
 * network the network profiles use. OKX's connector sends a lone script-path PSBT through `signPsbts`,
 * because OKX's `signPsbt` drops `autoFinalized: false`, so both of its methods are wrapped.
 */
const PROVIDER_HOOKS = {
  unisat: { providerPath: ["unisat"], methods: ["signPsbt"] },
  okx: {
    providerPath: ["okxwallet", "bitcoinSignet"],
    methods: ["signPsbts", "signPsbt"],
  },
} as const satisfies Partial<
  Record<
    BtcWalletId,
    {
      providerPath: readonly string[];
      methods: readonly ("signPsbt" | "signPsbts")[];
    }
  >
>;

type PeginPsbtExtrasWallet = keyof typeof PROVIDER_HOOKS;

export function supportsPeginPsbtExtras(
  btcWallet: BtcWalletId,
): btcWallet is PeginPsbtExtrasWallet {
  return btcWallet in PROVIDER_HOOKS;
}

/** Labels of the wallets the injection supports, for the CLI's refusal. */
export const PEGIN_PSBT_EXTRAS_WALLET_LABELS = BTC_WALLETS.filter((wallet) =>
  supportsPeginPsbtExtras(wallet.id),
).map((wallet) => wallet.label);

/** What the page-side wrapper reports through its binding. */
type InjectionEvent =
  | { kind: "patched"; method: string }
  | { kind: "error"; message: string };

export interface PeginPsbtExtrasProbe {
  /** Throws unless the wallet's provider was wrapped and its PegIn answer was rewritten once. */
  assertTampered(): Promise<void>;
}

/**
 * Page-side source. A raw string for the same reason as recording.ts's SIGNING_CAPTURE_SOURCE: tsx's
 * keepNames helper would be undefined in the page. Re-scans on an interval because the extension may
 * inject its provider after this script runs.
 */
const injectionSource = (btcWallet: PeginPsbtExtrasWallet): string => `(() => {
  if (window.__e2ePeginPsbtExtrasHooked) return;
  window.__e2ePeginPsbtExtrasHooked = true;
  var HOOK = ${JSON.stringify(PROVIDER_HOOKS[btcWallet])};
  var SCAN_INTERVAL_MS = 500;
  var armed = true;
  // The binding answers asynchronously, so a failed report is kept here for the
  // runner to read when an expected event never arrives.
  var reportFailures = [];
  window.__e2ePeginPsbtExtrasReportFailures = reportFailures;
  function report(entry) {
    Promise.resolve()
      .then(function () { return window.__e2ePeginPsbtExtrasReport(JSON.stringify(entry)); })
      .catch(function (error) {
        reportFailures.push(entry.kind + ": " + String(error && error.message ? error.message : error));
      });
  }
  function isScriptPathRequest(options) {
    return !!options && options.autoFinalized === false &&
      Array.isArray(options.toSignInputs) && options.toSignInputs.length > 0 &&
      options.toSignInputs.every(function (input) { return input.useTweakedSigner === false; });
  }
  // Each rewrite takes a method's arguments and the wallet's answer, and returns what the dApp receives.
  // Both share \`armed\`, so one answer per page load is rewritten whichever method carried it.
  var REWRITES = {
    signPsbt: function (args, signed) {
      if (!isScriptPathRequest(args[1])) return signed;
      armed = false;
      return window.__e2eTamperPeginPsbt(signed);
    },
    // Only a batch of one: the connector's lone-PSBT route. A split deposit's batch is never rewritten.
    signPsbts: function (args, signed) {
      var options = args[1];
      if (!Array.isArray(args[0]) || args[0].length !== 1 || !Array.isArray(options) ||
          !isScriptPathRequest(options[0]) || !Array.isArray(signed) || signed.length !== 1) return signed;
      armed = false;
      return window.__e2eTamperPeginPsbt(signed[0]).then(function (rewritten) { return [rewritten]; });
    },
  };
  // The provider each method last refused a swap on, so the rescan reports a refusal once.
  var refusedBy = {};
  function wrap() {
    var provider = window;
    for (var i = 0; i < HOOK.providerPath.length && provider; i++) provider = provider[HOOK.providerPath[i]];
    if (!provider) return;
    HOOK.methods.forEach(function (method) {
      var original = provider[method];
      if (typeof original !== "function" || original.__e2ePeginPsbtExtras || refusedBy[method] === provider) return;
      var wrapped = async function () {
        var signed = await original.apply(this, arguments);
        if (!armed) return signed;
        return REWRITES[method](arguments, signed);
      };
      wrapped.__e2ePeginPsbtExtras = true;
      try {
        provider[method] = wrapped;
        // Outside strict mode a frozen object or a Proxy can drop the assignment without throwing.
        if (provider[method] !== wrapped) throw new Error("the provider kept its own method");
        report({ kind: "patched", method: method });
      } catch (error) {
        refusedBy[method] = provider;
        report({ kind: "error", message: method + ": " + String(error && error.message ? error.message : error) });
      }
    });
  }
  wrap();
  setInterval(wrap, SCAN_INTERVAL_MS);
})()`;

/**
 * Wrap the BTC wallet's signing methods in the dApp page (now and on every later navigation) so its
 * answer to the PegIn signing request carries the extra fields. Install before the deposit is signed.
 */
export async function installPeginPsbtExtras(
  page: Page,
  btcWallet: BtcWalletId,
  log: (m: string) => void,
): Promise<PeginPsbtExtrasProbe> {
  if (!supportsPeginPsbtExtras(btcWallet))
    throw new Error(
      `PegIn PSBT injection has no provider hook for ${btcWallet}; it supports ${PEGIN_PSBT_EXTRAS_WALLET_LABELS.join(" and ")}.`,
    );
  const hook = PROVIDER_HOOKS[btcWallet];
  const patchedMethods = new Set<string>();
  let tampered = 0;
  const failures: string[] = [];

  await page.exposeFunction("__e2ePeginPsbtExtrasReport", (json: string) => {
    const event = JSON.parse(json) as InjectionEvent;
    if (event.kind === "patched") patchedMethods.add(event.method);
    if (event.kind === "error") {
      failures.push(event.message);
      log(`⚠️ PegIn PSBT injection failed in the page: ${event.message}`);
    }
  });
  await page.exposeFunction(
    "__e2eTamperPeginPsbt",
    (signedPsbtHex: string): string => {
      // One answer per run: a reload re-arms the page script, not this binding.
      if (tampered > 0) return signedPsbtHex;
      try {
        const rewritten = addWalletPsbtExtras(signedPsbtHex);
        tampered += 1;
        log(
          "Rewrote the wallet's PegIn answer: added a key-path signature, a final witness and a scriptSig, and filed the signature under a foreign leaf hash.",
        );
        return rewritten;
      } catch (error) {
        // The dApp's signing then fails, and the flow throws before `assertTampered` runs, so this
        // line is the only place the cause reaches the run log.
        failures.push(String(error));
        log(
          `⚠️ PegIn PSBT injection could not rewrite the wallet's answer: ${error}`,
        );
        throw error;
      }
    },
  );
  const source = injectionSource(btcWallet);
  await page.addInitScript({ content: source });
  await page.evaluate(source);
  const providerName = `window.${hook.providerPath.join(".")}`;
  log(
    `PegIn PSBT injection armed for the wallet's first script-path answer (${providerName}: ${hook.methods.join(", ")})`,
  );

  return {
    async assertTampered() {
      const undelivered = (await page.evaluate(
        "window.__e2ePeginPsbtExtrasReportFailures || []",
      )) as string[];
      const detail = [...failures, ...undelivered];
      const suffix =
        detail.length > 0 ? ` Failures: ${detail.join("; ")}.` : "";
      const unpatched = hook.methods.filter(
        (method) => !patchedMethods.has(method),
      );
      if (unpatched.length > 0)
        throw new Error(
          `PegIn PSBT injection: ${providerName}.${unpatched.join(", ")} was never wrapped, so the deposit may have run without the extra fields.${suffix}`,
        );
      if (tampered !== 1)
        throw new Error(
          `PegIn PSBT injection: expected the wallet's PegIn answer to be rewritten once, got ${tampered}.${suffix}`,
        );
      if (detail.length > 0)
        throw new Error(`PegIn PSBT injection reported failures.${suffix}`);
    },
  };
}
