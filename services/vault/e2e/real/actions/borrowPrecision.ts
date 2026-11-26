/**
 * `borrow --precision-probe`: the Borrow amount box must keep a typed amount within the token's on-chain
 * precision, and the borrow must sign exactly that amount.
 *
 * The probe types the borrow amount with one digit past the token's precision, key by key as a user
 * would. The box must drop that digit (fail-fast, before anything is signed). The run then borrows, and
 * the end state is the mined transaction's calldata: the amount it signed must be exactly the amount the
 * box showed, in the token's base units.
 *
 * Why the overflow digit is a 9: an app that keeps the digit sends `parseUnits(amount.toFixed(decimals))`,
 * and `toFixed` rounds, so a trailing 9 signs one base unit MORE than the box can show. A probe digit
 * below 5 would round away and hide the bug.
 */
import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Page } from "@playwright/test";
import {
  type Abi,
  decodeFunctionData,
  getAddress,
  isAddress,
  isAddressEqual,
  parseUnits,
} from "viem";

import { type BorrowReserve, describeReserve } from "../borrowParams";
import { type NetworkName } from "../config";
import { createEthClient, resolveNetworkContracts } from "../networkContracts";
import { FORM_SETTLE_MS, STEP_TIMEOUT_MS } from "../timing";

import { type AaveWriteWatch } from "./aaveWriteRpc";
import { AMOUNT_INPUT } from "./selectors";

/**
 * The most fraction digits the app's Borrow input accepts, whatever the token's decimals (the app's cap
 * on `toFixed` precision). KEEP IN SYNC with SAFE_TOFIXED_PRECISION in src/applications/aave/constants.ts:
 * the e2e layer does not import from `src/` (see borrowParams.ts). The signed-amount check is exact for
 * 6- and 8-decimal tokens; an 18-decimal amount with an integer part can still round when it is signed.
 */
const APP_INPUT_MAX_DECIMALS = 15;

/** What the probe can type: digits, optionally a dot and more digits — all the amount box accepts. */
const PLAIN_AMOUNT_RX = /^\d+(\.\d+)?$/;

/** The digit typed past the token's precision. It rounds UP, so a kept digit signs one extra base unit. */
const OVERFLOW_DIGIT = "9";

/** The adapter function the Borrow form calls: `(debtReserveId, amount, receiver)`. */
const BORROW_FUNCTION_NAME = "borrowFromCorePosition";

/** What to type, what the box must then show, and what the borrow must sign. */
export interface PrecisionProbe {
  /** The amount with one digit past the token's precision. */
  typed: string;
  /** The amount padded to exactly the token's precision: what the box must keep. */
  expectedBox: string;
  /** `expectedBox` in the token's base units: what the borrow must sign. */
  expectedBaseUnits: bigint;
}

/**
 * Build the probe from the borrow amount. Pads its fraction to the token's precision, then appends one
 * overflow digit. Throws when the amount is not a plain decimal number, or already has more fraction
 * digits than the token allows: the probe adds the extra digit itself. The CLI calls it before the
 * browser opens when it can read the reserve list, so a bad amount fails before any `--pegin-first`
 * peg-in; otherwise only the borrow action calls it, after any peg-in.
 */
export function buildPrecisionProbe(
  amount: string,
  reserve: BorrowReserve,
): PrecisionProbe {
  if (!PLAIN_AMOUNT_RX.test(amount))
    throw new Error(
      `--precision-probe: the borrow amount "${amount}" is not a plain decimal number. The probe types it key by key, and the amount box accepts only digits and one dot — pass e.g. 1.5.`,
    );
  const precision = Math.min(reserve.decimals, APP_INPUT_MAX_DECIMALS);
  const [integer, fraction = ""] = amount.split(".");
  if (fraction.length > precision)
    throw new Error(
      `--precision-probe: the borrow amount ${amount} already has ${fraction.length} fraction digits, more than ${describeReserve(reserve)} allows (${precision}). Pass an amount within the token's precision — the probe adds the extra digit itself.`,
    );
  const expectedBox = `${integer}.${fraction.padEnd(precision, "0")}`;
  return {
    typed: `${expectedBox}${OVERFLOW_DIGIT}`,
    expectedBox,
    expectedBaseUnits: parseUnits(expectedBox, reserve.decimals),
  };
}

/**
 * Type the probe into the Borrow amount box key by key, then require the box to show the amount without
 * the overflow digit. Throws BEFORE anything is signed when the box shows anything else.
 */
export async function typePrecisionProbe(
  page: Page,
  log: (m: string) => void,
  probe: PrecisionProbe,
): Promise<void> {
  log(
    `🔎 Precision probe: typing ${probe.typed}; the box must keep ${probe.expectedBox} and the borrow must sign ${probe.expectedBaseUnits} base units.`,
  );
  const input = page.locator(AMOUNT_INPUT).first();
  await input.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  await input.fill("");
  await input.pressSequentially(probe.typed);
  await page.waitForTimeout(FORM_SETTLE_MS);

  const shown = await input.inputValue();
  if (shown !== probe.expectedBox)
    throw new Error(
      shown === probe.typed
        ? `Precision probe: typed ${probe.typed} and the Borrow box kept every digit — the form accepted a digit past the token's precision. Nothing was signed.`
        : `Precision probe: typed ${probe.typed}; the Borrow box shows "${shown}", expected "${probe.expectedBox}". Nothing was signed.`,
    );
  log(`✅ The Borrow box dropped the extra digit: "${shown}".`);
}

/**
 * The end state: decode the mined borrow and require it to call the adapter's borrow for this reserve,
 * paying the connected account, with exactly the probe's base units.
 */
export async function assertSignedBorrowAmount(
  network: NetworkName,
  account: string,
  reserve: BorrowReserve,
  watch: AaveWriteWatch,
  probe: PrecisionProbe,
  log: (m: string) => void,
): Promise<void> {
  const write = watch.write();
  if (!write)
    throw new Error(
      "Precision probe: the borrow reached the success screen, but the app's RPC never reported its transaction mined, so there is no transaction to check the signed amount on.",
    );
  const client = createEthClient(resolveNetworkContracts(network).ethRpcUrl);
  const tx = await client.getTransaction({ hash: write.hash });
  const call = decodeFunctionData({
    abi: AaveIntegrationAdapterABI as Abi,
    data: tx.input,
  });
  if (call.functionName !== BORROW_FUNCTION_NAME)
    throw new Error(
      `Precision probe: transaction ${write.hash} calls ${call.functionName}, not ${BORROW_FUNCTION_NAME}.`,
    );
  const [reserveId, amount, receiver] = call.args ?? [];
  if (reserveId !== reserve.reserveId)
    throw new Error(
      `Precision probe: transaction ${write.hash} borrows from reserve ${String(reserveId)}, not ${describeReserve(reserve)}.`,
    );
  if (
    typeof receiver !== "string" ||
    !isAddress(receiver) ||
    !isAddressEqual(receiver, getAddress(account))
  )
    throw new Error(
      `Precision probe: transaction ${write.hash} pays ${String(receiver)}, not the connected account ${account}.`,
    );
  if (typeof amount !== "bigint" || amount !== probe.expectedBaseUnits)
    throw new Error(
      `Precision probe: transaction ${write.hash} signed ${String(amount)} base units, not the ${probe.expectedBaseUnits} the box showed (${probe.expectedBox}).`,
    );
  log(
    `✅ The borrow signed exactly ${amount} base units (${probe.expectedBox} ${reserve.symbol}) — tx ${write.hash}.`,
  );
}
