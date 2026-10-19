/**
 * `--inject-pegin-psbt-extras`: make the BTC wallet answer the PegIn signing request with fields the dApp
 * never built beside its genuine signature: a key-path signature, its own final witness, a scriptSig,
 * and the signature filed under a leaf hash no leaf has (`addWalletPsbtExtras`). The dApp must discard
 * them and register the PegIn witness it built itself, so the deposit must still complete, and the
 * registered-witness check every pegin run makes (`assertRegisteredPeginWitness`) must still pass.
 *
 * Mechanism: the page-side script wraps `signPsbt` on UniSat's provider (`window.unisat`). UniSat's
 * Proxy has no `set` trap, so the method can be swapped, as the recorder's signing capture does, and the
 * wallet-connector reads it at call time. The deposit's first script-path request (`autoFinalized: false`,
 * every input signed with the untweaked key) is the PegIn input's, made inside `preparePegin` before the
 * proof of possession, the Ethereum registration and the Pre-PegIn broadcast. The wrapper hands that one
 * answer to a Node binding to rewrite; the Pre-PegIn funding request (the connector's
 * `autoFinalized: true` default) and every later request reach the dApp unchanged.
 */
import type { Page } from "@playwright/test";

import { addWalletPsbtExtras } from "./peginWalletPsbt";

/** What the page-side wrapper reports through its binding. */
type InjectionEvent = { kind: "patched" } | { kind: "error"; message: string };

export interface PeginPsbtExtrasProbe {
  /** Throws unless UniSat's provider was wrapped and the wallet's PegIn answer was rewritten once. */
  assertTampered(): Promise<void>;
}

/**
 * Page-side source. A raw string for the same reason as recording.ts's SIGNING_CAPTURE_SOURCE: tsx's
 * keepNames helper would be undefined in the page. Re-scans on an interval because the extension may
 * inject its provider after this script runs.
 */
const INJECTION_SOURCE = `(() => {
  if (window.__e2ePeginPsbtExtrasHooked) return;
  window.__e2ePeginPsbtExtrasHooked = true;
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
  function wrap() {
    var provider = window.unisat;
    if (!provider || typeof provider.signPsbt !== "function" || provider.signPsbt.__e2ePeginPsbtExtras) return;
    var original = provider.signPsbt;
    var wrapped = async function (psbtHex, options) {
      var signed = await original.apply(this, arguments);
      if (!armed || !isScriptPathRequest(options)) return signed;
      armed = false;
      return window.__e2eTamperPeginPsbt(signed);
    };
    wrapped.__e2ePeginPsbtExtras = true;
    try {
      provider.signPsbt = wrapped;
      report({ kind: "patched" });
    } catch (error) {
      report({ kind: "error", message: String(error && error.message ? error.message : error) });
    }
  }
  wrap();
  setInterval(wrap, SCAN_INTERVAL_MS);
})()`;

/**
 * Wrap UniSat's `signPsbt` in the dApp page (now and on every later navigation) so the wallet's answer
 * to the PegIn signing request carries the extra fields. Install before the deposit is signed.
 */
export async function installPeginPsbtExtras(
  page: Page,
  log: (m: string) => void,
): Promise<PeginPsbtExtrasProbe> {
  let patched = false;
  let tampered = 0;
  const failures: string[] = [];

  await page.exposeFunction("__e2ePeginPsbtExtrasReport", (json: string) => {
    const event = JSON.parse(json) as InjectionEvent;
    if (event.kind === "patched") patched = true;
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
  await page.addInitScript({ content: INJECTION_SOURCE });
  await page.evaluate(INJECTION_SOURCE);
  log("PegIn PSBT injection armed for the wallet's first script-path answer");

  return {
    async assertTampered() {
      const undelivered = (await page.evaluate(
        "window.__e2ePeginPsbtExtrasReportFailures || []",
      )) as string[];
      const detail = [...failures, ...undelivered];
      const suffix =
        detail.length > 0 ? ` Failures: ${detail.join("; ")}.` : "";
      if (!patched)
        throw new Error(
          `PegIn PSBT injection: UniSat's provider was never wrapped, so the deposit ran without the extra fields.${suffix}`,
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
