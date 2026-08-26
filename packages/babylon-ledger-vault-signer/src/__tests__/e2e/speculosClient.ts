/**
 * Speculos REST transport + nanosp screen driver for the e2e suite.
 *
 * REST surface (speculos `api/`): POST /apdu {"data": hex} → {"data": hex}
 * where the response hex is data ‖ 2-byte status word; POST /button/{b}
 * {"action": "press-and-release"}; GET /events?currentscreenonly=true.
 * Navigation recipe mirrors the live-verified reference driver
 * (`lsk_ceremony2.py`): press right until the target text shows, then both.
 *
 * @module ledger-vault-signer/__tests__/e2e/speculosClient
 */

import { createThrowingApduSender, hex2, hex4, type RawApduSender } from "../../rawApdu";
import type { ApduSender } from "../../vaultCommands";

/** BOLOS-level GET_APP_AND_VERSION (any app answers it). */
const CLA_BOLOS = 0xb0;
const INS_GET_APP_AND_VERSION = 0x01;
/** ISO-7816 success; exported so tests build responses without a bare literal. */
export const SW_OK = 0x9000;
/** `format(1)=0x01 ‖ nameLen ‖ name ‖ versionLen ‖ version …` (verified live). */
const APP_AND_VERSION_FORMAT = 0x01;
/** Shortest legal response: format byte + both length bytes, name and version empty. */
const MIN_APP_AND_VERSION_BYTES = 3;

const MAX_APDU_DATA_BYTES = 0xff;
const STATUS_WORD_HEX_CHARS = 4;

/** One press per ~150 ms is enough for Speculos to settle each redraw. */
const PRESS_SETTLE_MS = 150;
/** Upper bound on right-presses while hunting the approval screen. */
const MAX_NAV_PRESSES = 40;
/** How long to wait for a blocking APDU to put its review screen up. */
const REVIEW_SCREEN_WAIT_MS = 15_000;
/** Timeout for one events-poll fetch against the Speculos REST API. */
const EVENTS_POLL_TIMEOUT_MS = 10_000;
/** The vault app's idle dashboard shows this line ("… app is ready"). */
const IDLE_SCREEN_TEXT = "app is ready";

/**
 * SPECULOS_URL, or "" when unset — the value the e2e files' `skipIf` gates on.
 * Under SPECULOS_REQUIRED (CI) an empty URL throws at module load instead, so
 * a missing emulator fails the run rather than silently skipping it.
 */
export function readSpeculosUrl(): string {
  const url = process.env.SPECULOS_URL ?? "";
  if (url === "" && (process.env.SPECULOS_REQUIRED ?? "") !== "") {
    throw new Error("SPECULOS_REQUIRED is set but SPECULOS_URL is empty — the Speculos e2e files cannot run");
  }
  return url;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(baseUrl: string, path: string, body: unknown): Promise<unknown> {
  // No client-side timeout: screen-triggering APDUs block until approved;
  // the vitest per-test timeout is the outer bound.
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Speculos POST ${path} answered HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Non-throwing sender over the Speculos REST API — the response hex always
 * ends in the 2-byte status word, so every SW (0xE000 included) comes back
 * as data, exactly the {@link RawApduSender} contract.
 */
export function createSpeculosRawApduSender(baseUrl: string): RawApduSender {
  return async (apdu) => {
    if (apdu.data.length > MAX_APDU_DATA_BYTES) {
      throw new Error(`APDU data is ${apdu.data.length} bytes; Lc is a single byte (max ${MAX_APDU_DATA_BYTES})`);
    }
    const wire = new Uint8Array(5 + apdu.data.length);
    wire[0] = apdu.cla;
    wire[1] = apdu.ins;
    wire[2] = apdu.p1;
    wire[3] = apdu.p2;
    wire[4] = apdu.data.length;
    wire.set(apdu.data, 5);
    const body = (await postJson(baseUrl, "/apdu", { data: toHex(wire) })) as { data?: unknown };
    if (typeof body.data !== "string" || body.data.length < STATUS_WORD_HEX_CHARS || body.data.length % 2 !== 0) {
      throw new Error(`Speculos /apdu answered without a status word: ${JSON.stringify(body)}`);
    }
    const raw = fromHex(body.data);
    const sw = (raw[raw.length - 2] << 8) | raw[raw.length - 1];
    return { sw, data: raw.subarray(0, raw.length - 2) };
  };
}

/**
 * The ceremony's throwing sender, built by the same shared helper the DMK
 * transport uses so both raise identical typed errors. No app identity: this
 * client reads the app separately via {@link getAppAndVersion}.
 */
export function createSpeculosApduSender(baseUrl: string): ApduSender {
  return createThrowingApduSender(createSpeculosRawApduSender(baseUrl));
}

/** All text lines of the currently displayed screen, joined with " | ". */
export async function readScreenText(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/events?currentscreenonly=true`, {
    signal: AbortSignal.timeout(EVENTS_POLL_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Speculos GET /events answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as { events?: { text?: string }[] };
  return (body.events ?? []).map((event) => event.text ?? "").join(" | ");
}

export async function pressButton(baseUrl: string, button: "left" | "right" | "both"): Promise<void> {
  await postJson(baseUrl, `/button/${button}`, { action: "press-and-release" });
}

/**
 * Drive a nanosp approval flow for a review screen a concurrently-pending
 * APDU has put up (or is about to): wait for the dashboard to be replaced,
 * press right until `targetText` shows, then press both to confirm.
 *
 * @returns the screens visited, for failure diagnostics
 */
export async function approveOnScreen(baseUrl: string, targetText: string): Promise<string[]> {
  const visited: string[] = [];

  // Never blind-press the idle dashboard: right/both there navigates the app
  // menu (worst case confirming "Quit"). Wait for the review flow to appear.
  const waitDeadline = Date.now() + REVIEW_SCREEN_WAIT_MS;
  let screen = await readScreenText(baseUrl);
  while ((screen.length === 0 || screen.includes(IDLE_SCREEN_TEXT)) && Date.now() < waitDeadline) {
    await sleep(PRESS_SETTLE_MS);
    screen = await readScreenText(baseUrl);
  }
  if (screen.length === 0 || screen.includes(IDLE_SCREEN_TEXT)) {
    throw new Error(`No review screen appeared within ${REVIEW_SCREEN_WAIT_MS} ms (still: "${screen}")`);
  }

  visited.push(screen);
  for (let press = 0; press < MAX_NAV_PRESSES; press++) {
    if (screen.includes(targetText)) {
      await pressButton(baseUrl, "both");
      await sleep(PRESS_SETTLE_MS);
      return visited;
    }
    await pressButton(baseUrl, "right");
    await sleep(PRESS_SETTLE_MS);
    screen = await readScreenText(baseUrl);
    visited.push(screen);
  }
  throw new Error(`"${targetText}" not reached in ${MAX_NAV_PRESSES} presses; screens: ${visited.join(" || ")}`);
}

export interface AppAndVersion {
  readonly name: string;
  readonly version: string;
}

/**
 * GET_APP_AND_VERSION (`B0 01 00 00 00`), parsed per the live byte layout.
 * Reference client: LedgerHQ/ledger-live@2ec1cda
 * `libs/ledger-live-common/src/hw/getAppAndVersion.ts`. Each rejection carries
 * its own message so no two guards are indistinguishable to a caller or a test.
 */
export async function getAppAndVersion(sendRaw: RawApduSender): Promise<AppAndVersion> {
  const { sw, data } = await sendRaw({
    cla: CLA_BOLOS,
    ins: INS_GET_APP_AND_VERSION,
    p1: 0x00,
    p2: 0x00,
    data: new Uint8Array(0),
  });
  if (sw !== SW_OK) {
    throw new Error(`GET_APP_AND_VERSION answered sw 0x${hex4(sw)}`);
  }
  // Lengths only, never the response bytes: this client also drives real devices.
  if (data.length < MIN_APP_AND_VERSION_BYTES) {
    throw new Error(
      `GET_APP_AND_VERSION answered ${data.length} bytes; the format and length prefixes alone need ${MIN_APP_AND_VERSION_BYTES}`,
    );
  }
  if (data[0] !== APP_AND_VERSION_FORMAT) {
    throw new Error(
      `GET_APP_AND_VERSION answered format 0x${hex2(data[0])}, expected 0x${hex2(APP_AND_VERSION_FORMAT)}`,
    );
  }
  const nameLen = data[1];
  const nameEnd = 2 + nameLen;
  // Check BEFORE reading the version-length byte: an out-of-range read yields
  // undefined, and the NaN that follows makes every `>` bound below false.
  if (nameEnd >= data.length) {
    throw new Error(
      `GET_APP_AND_VERSION response truncated: name length ${nameLen} leaves no version-length byte in ${data.length} bytes`,
    );
  }
  const versionLen = data[nameEnd];
  const versionEnd = nameEnd + 1 + versionLen;
  if (versionEnd > data.length) {
    throw new Error(
      `GET_APP_AND_VERSION response truncated: version length ${versionLen} needs ${versionEnd} bytes, response has ${data.length}`,
    );
  }
  const decoder = new TextDecoder();
  return {
    name: decoder.decode(data.subarray(2, nameEnd)),
    version: decoder.decode(data.subarray(nameEnd + 1, versionEnd)),
  };
}
