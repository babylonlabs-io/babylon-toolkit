/**
 * Deterministic BTC wallet mock conforming to `IBTCProvider` from
 * `@babylonlabs-io/wallet-connector`. Outputs use obvious test bytes
 * (all-`ab` / all-`cd` / etc.) so they cannot be confused with real key
 * material - if these values ever appear in production telemetry, that
 * is a bug.
 *
 * Two surfaces:
 *   - `provider`: drop-in `IBTCProvider` for code that calls the wallet.
 *   - `script`:   per-call overrides so tests can simulate user
 *                 rejections, timeouts, or specific return values.
 */

import type {
  IBTCProvider,
  InscriptionIdentifier,
  Network,
} from "@babylonlabs-io/wallet-connector";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_PUBLIC_KEY_HEX = `02${"ab".repeat(32)}`;
// Real signet bech32 (p2wpkh) derived from `DEFAULT_PUBLIC_KEY_HEX`.
// Hard-coded so this module has no runtime dependency on bitcoinjs-lib;
// the value is verified by a unit test that re-derives it.
const DEFAULT_ADDRESS = "tb1qce0n0rv27dwx37dfvhxaaly4lnwelqjuqywvka";
// `Network` is a string enum; "signet" is its SIGNET member. We use the
// literal instead of `Network.SIGNET` so this fixture stays a type-only
// importer of wallet-connector. A value import here pulls the package's
// source into the vitest transform pipeline and trips a parse error
// that the existing tests in this project work around by mocking
// `@babylonlabs-io/wallet-connector` entirely.
const DEFAULT_NETWORK: Network = "signet" as Network;
const DEFAULT_PROVIDER_NAME = "E2E Mock BTC";
const DEFAULT_PROVIDER_ICON = "data:image/svg+xml;base64,PHN2Zy8+";
const SIGNED_MESSAGE_HEX = "cd".repeat(64);

export interface MockBtcWalletOptions {
  publicKeyHex?: string;
  address?: string;
  network?: Network;
  providerName?: string;
  providerIcon?: string;
}

type BtcMethod =
  | "connectWallet"
  | "getAddress"
  | "getPublicKeyHex"
  | "getNetwork"
  | "getInscriptions"
  | "getWalletProviderName"
  | "getWalletProviderIcon"
  | "signPsbt"
  | "signPsbts"
  | "signMessage"
  | "deriveContextHash";

type ScriptedReturn<R> = { kind: "return"; value: R };
type ScriptedReject = { kind: "reject"; error: Error };
type ScriptedTimeout = { kind: "timeout"; ms: number };
type ScriptedAction<R> = ScriptedReturn<R> | ScriptedReject | ScriptedTimeout;

export interface MockBtcScript {
  /** Next call to `method` resolves with the given value (skipping default). */
  returnNext<M extends BtcMethod>(
    method: M,
    value: MethodReturn[M],
  ): MockBtcScript;
  /** Next call to `method` rejects with the given error. */
  rejectNext(method: BtcMethod, error: Error): MockBtcScript;
  /** Next call to `method` rejects after `ms` (use Playwright fake clock). */
  timeoutNext(method: BtcMethod, ms: number): MockBtcScript;
  /** Discard all queued overrides. */
  clear(): void;
  /** How many times `method` has been called since wallet creation. */
  callCount(method: BtcMethod): number;
}

type MethodReturn = {
  connectWallet: void;
  getAddress: string;
  getPublicKeyHex: string;
  getNetwork: Network;
  getInscriptions: InscriptionIdentifier[];
  getWalletProviderName: string;
  getWalletProviderIcon: string;
  signPsbt: string;
  signPsbts: string[];
  signMessage: string;
  deriveContextHash: string;
};

export interface MockBtcWallet {
  provider: IBTCProvider;
  script: MockBtcScript;
}

export function createMockBtcWallet(
  options: MockBtcWalletOptions = {},
): MockBtcWallet {
  const config = {
    publicKeyHex: options.publicKeyHex ?? DEFAULT_PUBLIC_KEY_HEX,
    address: options.address ?? DEFAULT_ADDRESS,
    network: options.network ?? DEFAULT_NETWORK,
    providerName: options.providerName ?? DEFAULT_PROVIDER_NAME,
    providerIcon: options.providerIcon ?? DEFAULT_PROVIDER_ICON,
  };

  const queues: Partial<Record<BtcMethod, ScriptedAction<unknown>[]>> = {};
  const counts: Record<BtcMethod, number> = {
    connectWallet: 0,
    getAddress: 0,
    getPublicKeyHex: 0,
    getNetwork: 0,
    getInscriptions: 0,
    getWalletProviderName: 0,
    getWalletProviderIcon: 0,
    signPsbt: 0,
    signPsbts: 0,
    signMessage: 0,
    deriveContextHash: 0,
  };

  function consume<M extends BtcMethod>(
    method: M,
  ): ScriptedAction<MethodReturn[M]> | undefined {
    counts[method] += 1;
    const queue = queues[method] as
      | ScriptedAction<MethodReturn[M]>[]
      | undefined;
    return queue?.shift();
  }

  async function applyScript<M extends BtcMethod>(
    method: M,
    fallback: () => Promise<MethodReturn[M]> | MethodReturn[M],
  ): Promise<MethodReturn[M]> {
    const action = consume(method);
    if (!action) return fallback();
    if (action.kind === "return") return action.value;
    if (action.kind === "reject") throw action.error;
    await new Promise((resolve) => setTimeout(resolve, action.ms));
    throw new Error(`mock BTC wallet ${method} timed out after ${action.ms}ms`);
  }

  const provider: IBTCProvider = {
    connectWallet: () => applyScript("connectWallet", async () => undefined),
    getAddress: () => applyScript("getAddress", () => config.address),
    getPublicKeyHex: () =>
      applyScript("getPublicKeyHex", () => config.publicKeyHex),
    getNetwork: () => applyScript("getNetwork", () => config.network),
    getInscriptions: () => applyScript("getInscriptions", () => []),
    getWalletProviderName: () =>
      applyScript("getWalletProviderName", () => config.providerName),
    getWalletProviderIcon: () =>
      applyScript("getWalletProviderIcon", () => config.providerIcon),
    // SignPsbtOptions is part of the IBTCProvider contract but the mock
    // does not consume it; TypeScript bivariance lets a narrower
    // signature satisfy the interface.
    //
    // Returns the input PSBT verbatim so it remains decodable by
    // Psbt.fromHex(...). The mock therefore covers flows that pass the
    // signed PSBT through unchanged; flows that need a real partial
    // signature (broadcast, WASM-side cross-checks) must script a
    // valid signed PSBT via `script.returnNext("signPsbt", ...)`.
    signPsbt: (psbtHex: string) => applyScript("signPsbt", () => psbtHex),
    signPsbts: (psbtsHexes: string[]) =>
      applyScript("signPsbts", () => [...psbtsHexes]),
    signMessage: () => applyScript("signMessage", () => SIGNED_MESSAGE_HEX),
    deriveContextHash: (appName: string, context: string) =>
      applyScript("deriveContextHash", () =>
        sha256Hex(`${appName}:${context}`),
      ),
    on: () => {},
    off: () => {},
  };

  const script: MockBtcScript = {
    returnNext(method, value) {
      const queue = (queues[method] ??= []) as ScriptedAction<unknown>[];
      queue.push({ kind: "return", value });
      return script;
    },
    rejectNext(method, error) {
      const queue = (queues[method] ??= []) as ScriptedAction<unknown>[];
      queue.push({ kind: "reject", error });
      return script;
    },
    timeoutNext(method, ms) {
      const queue = (queues[method] ??= []) as ScriptedAction<unknown>[];
      queue.push({ kind: "timeout", ms });
      return script;
    },
    clear() {
      for (const key of Object.keys(queues) as BtcMethod[]) {
        delete queues[key];
      }
    },
    callCount(method) {
      return counts[method];
    },
  };

  return { provider, script };
}
