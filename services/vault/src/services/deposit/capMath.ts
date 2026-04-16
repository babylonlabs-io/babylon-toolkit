/**
 * Pure cap math helpers for the application BTC supply cap feature.
 *
 * Consumers: useApplicationCap hook, SupplyCapSection component,
 * validateRemainingCapacity validator.
 */

import type { ApplicationCap } from "@/clients/eth-contract/cap-policy";

export interface CapSnapshot {
  /** Total BTC cap for the app, in satoshis. 0 when uncapped. */
  totalCapBTC: bigint;
  /** Per-address BTC cap for the app, in satoshis. 0 when uncapped. */
  perAddressCapBTC: bigint;
  /**
   * Current total BTC locked in the application, in satoshis.
   *
   * Only meaningful when `hasTotalCap || hasPerAddressCap`. When both caps are
   * 0 (uncapped), `useApplicationCap` short-circuits without waiting on the
   * usage query and fills this with a placeholder `0n` — consumers that
   * display actual usage must gate on one of the `has*Cap` flags.
   */
  totalBTC: bigint;
  /**
   * Current BTC locked by the user, in satoshis, or null when no user is
   * connected.
   *
   * Only meaningful when `hasTotalCap || hasPerAddressCap`. When uncapped,
   * this is a placeholder `null` — see the note on `totalBTC`.
   */
  userBTC: bigint | null;
  hasTotalCap: boolean;
  hasPerAddressCap: boolean;
  /** null when there is no total cap */
  remainingTotal: bigint | null;
  /** null when there is no per-address cap or no user */
  remainingForUser: bigint | null;
  /** min(remainingTotal, remainingForUser); null when neither cap applies */
  effectiveRemaining: bigint | null;
}

export interface CapSnapshotInput {
  caps: ApplicationCap;
  totalBTC: bigint;
  userBTC: bigint | null;
}

function clampZero(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

export function computeEffectiveRemaining(
  remainingTotal: bigint | null,
  remainingForUser: bigint | null,
): bigint | null {
  if (remainingTotal === null && remainingForUser === null) return null;
  if (remainingTotal === null) return remainingForUser;
  if (remainingForUser === null) return remainingTotal;
  return remainingTotal < remainingForUser ? remainingTotal : remainingForUser;
}

export function computeCapSnapshot(input: CapSnapshotInput): CapSnapshot {
  const { caps, totalBTC, userBTC } = input;
  const hasTotalCap = caps.totalCapBTC > 0n;
  const hasPerAddressCap = caps.perAddressCapBTC > 0n;

  const remainingTotal = hasTotalCap
    ? clampZero(caps.totalCapBTC - totalBTC)
    : null;

  const remainingForUser =
    hasPerAddressCap && userBTC !== null
      ? clampZero(caps.perAddressCapBTC - userBTC)
      : null;

  return {
    totalCapBTC: caps.totalCapBTC,
    perAddressCapBTC: caps.perAddressCapBTC,
    totalBTC,
    userBTC,
    hasTotalCap,
    hasPerAddressCap,
    remainingTotal,
    remainingForUser,
    effectiveRemaining: computeEffectiveRemaining(
      remainingTotal,
      remainingForUser,
    ),
  };
}
