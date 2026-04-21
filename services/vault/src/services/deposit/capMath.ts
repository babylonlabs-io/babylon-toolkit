/**
 * Pure cap math helpers for the application BTC supply cap feature.
 */

// ---------------------------------------------------------------------------
// Types — narrow structural types, no vault-service imports
// ---------------------------------------------------------------------------

/** Narrow structural type for cap configuration. */
export interface CapInput {
  totalCapBTC: bigint;
  perAddressCapBTC: bigint;
}

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
  caps: CapInput;
  totalBTC: bigint;
  userBTC: bigint | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampZero(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the effective remaining capacity from total and per-user remaining.
 * Returns the minimum of the two, or the single non-null value, or null if
 * neither cap applies.
 */
export function computeEffectiveRemaining(
  remainingTotal: bigint | null,
  remainingForUser: bigint | null,
): bigint | null {
  if (remainingTotal === null && remainingForUser === null) return null;
  if (remainingTotal === null) return remainingForUser;
  if (remainingForUser === null) return remainingTotal;
  return remainingTotal < remainingForUser ? remainingTotal : remainingForUser;
}

/**
 * Compute a full {@link CapSnapshot} from cap configuration and current usage.
 */
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
