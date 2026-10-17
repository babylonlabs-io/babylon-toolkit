/**
 * The mempool forgery the forged-stuck run installs (see forgedStuck.ts), and how it reads the row it
 * forges against. For each targeted vault it answers as a hostile Esplora would to make a healthy
 * Verified vault look swept by its PegIn: an outspend naming the vault's public PegIn txid as the HTLC's
 * spender, and, for the PegIn itself, the depositor-signed PegIn the registry already publishes — the
 * right txid and outpoint, but no preimage, since forging one takes the secret. Kept free of Playwright
 * so the matching, the bodies and the row reading can be unit-tested on their own.
 */
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Hex } from "viem";

/** One vault the run forges, taken from its on-chain registry record. Txids lowercase, no `0x`. */
export interface ForgedVault {
  vaultId: Hex;
  /** The Pre-PegIn funding the vault's HTLC output. */
  prePeginTxid: string;
  htlcVout: number;
  /** Txid of the on-chain signed PegIn — the spender the forged outspend names. */
  peginTxid: string;
  /** The depositor-signed PegIn as the registry stores it, served as the PegIn's hex. */
  signedPeginTxHex: string;
}

/** The registry fields the forgery is built from (`getVaultData(...).protocol`). */
export interface ForgeableRecord {
  prePeginTxHash: string;
  htlcVout: number;
  depositorSignedPeginTx: string;
}

const stripHex = (value: string): string => value.replace(/^0x/i, "");

export function forgedVaultFromRecord(
  vaultId: Hex,
  record: ForgeableRecord,
): ForgedVault {
  return {
    vaultId,
    prePeginTxid: stripHex(record.prePeginTxHash).toLowerCase(),
    htlcVout: record.htlcVout,
    peginTxid: stripHex(
      calculateBtcTxHash(record.depositorSignedPeginTx),
    ).toLowerCase(),
    signedPeginTxHex: stripHex(record.depositorSignedPeginTx),
  };
}

export type ForgedRequest =
  | { kind: "outspend"; vault: ForgedVault }
  | { kind: "hex"; vault: ForgedVault };

/** Esplora `GET /tx/:txid/outspend/:vout` — the app's HTLC spend probe. */
const OUTSPEND_PATH_RX = /\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/i;
/** Esplora `GET /tx/:txid/hex` — the app's fetch of the PegIn it proves the spend from. */
const HEX_PATH_RX = /\/tx\/([0-9a-f]{64})\/hex$/i;

/** Which forged answer, if any, a request from the page gets. Anything else goes to the real API. */
export function matchForgedRequest(
  vaults: readonly ForgedVault[],
  url: string,
): ForgedRequest | undefined {
  const { pathname } = new URL(url);
  const outspend = OUTSPEND_PATH_RX.exec(pathname);
  if (outspend) {
    const txid = outspend[1].toLowerCase();
    const vout = Number(outspend[2]);
    const vault = vaults.find(
      (v) => v.prePeginTxid === txid && v.htlcVout === vout,
    );
    return vault ? { kind: "outspend", vault } : undefined;
  }
  const hex = HEX_PATH_RX.exec(pathname);
  if (hex) {
    const txid = hex[1].toLowerCase();
    const vault = vaults.find((v) => v.peginTxid === txid);
    return vault ? { kind: "hex", vault } : undefined;
  }
  return undefined;
}

/** Whether a request is the Bitcoin API's `GET /tx/:txid/hex` for one transaction (txid lowercase). */
export function isTxHexRequest(url: string, txid: string): boolean {
  const hex = HEX_PATH_RX.exec(new URL(url).pathname);
  return hex !== null && hex[1].toLowerCase() === txid;
}

/**
 * Esplora's outspend shape for an output spent by an unconfirmed transaction — here the PegIn, which is
 * all the app's stuck probe looks at. Unconfirmed, so the forgery needs no invented block.
 */
export function forgedOutspendBody(vault: ForgedVault) {
  return {
    spent: true,
    txid: vault.peginTxid,
    vin: 0,
    status: { confirmed: false },
  };
}

// The stuck state on a pending row: its label (COPY.pegin.labels.ACTIVATION_INCOMPLETE), its badge
// (COPY.pegin.actionRequiredBadges.ACTIVATE_AND_REDEEM) and its CTA
// (COPY.pegin.primaryAction.ACTIVATE_AND_REDEEM).
const STUCK_ROW_TEXT_RX = /activation incomplete|withdraw required/i;
const WITHDRAW_CTA_RX = /^withdraw$/i;
/** COPY.pegin.primaryAction.ACTIVATE_VAULT */
const ACTIVATE_CTA_RX = /^activate$/i;
/**
 * A split sibling waiting for the earlier vault to activate (COPY.pegin.labels.AWAITING_EARLIER_VAULT):
 * its Activate is disabled, rendered without the CTA test id, until the earlier one activates.
 */
const AWAITING_EARLIER_VAULT_RX = /awaiting earlier btcvault/i;

/** Whether a pending row offers the activate-and-redeem escape hatch. */
export function rowOffersEscapeHatch(
  rowText: string,
  ctaText: string | undefined,
): boolean {
  return (
    STUCK_ROW_TEXT_RX.test(rowText) ||
    (ctaText !== undefined && WITHDRAW_CTA_RX.test(ctaText.trim()))
  );
}

/** Whether a pending row's CTA is the normal activation. */
export function ctaIsActivate(ctaText: string | undefined): boolean {
  return ctaText !== undefined && ACTIVATE_CTA_RX.test(ctaText.trim());
}

/** What the run reads off one pending row of the deposit. */
export interface RowObservation {
  rowText: string;
  ctaText: string | undefined;
}

/**
 * Whether the deposit's rows offer the normal activation: at least one row's CTA is Activate, and every
 * other row is a split sibling correctly waiting for the earlier vault.
 */
export function rowsOfferActivation(rows: readonly RowObservation[]): boolean {
  return (
    rows.some((row) => ctaIsActivate(row.ctaText)) &&
    rows.every(
      (row) =>
        ctaIsActivate(row.ctaText) ||
        AWAITING_EARLIER_VAULT_RX.test(row.rowText),
    )
  );
}
