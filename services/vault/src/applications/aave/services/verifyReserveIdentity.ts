/**
 * Prove what asset a reserve actually is, before its label or any of its
 * amounts reach the screen.
 *
 * The loan detail screen used to take the reserve's symbol, name and decimals
 * straight from the GraphQL indexer. A compromised indexer could keep a real
 * `reserveId`/`underlying` pair but spoof the symbol, so the page labelled one
 * asset while the transaction targeted another — and report decimals that made
 * the displayed debt and Max differ from the amount actually signed.
 *
 * This resolves the identity from sources the indexer does not control:
 *  1. `assertReserveMatchesOnChain` proves `reserveId -> underlying` against
 *     the env-pinned adapter's spoke — the only authority on which token the
 *     page is about.
 *  2. `getERC20Decimals(underlying)` supplies decimals. This is the exact
 *     helper the borrow/repay signing paths use, so display and signing can't
 *     disagree.
 *  3. The address-keyed token registry supplies the label, falling back to the
 *     token contract's own `symbol()`/`name()` for addresses it doesn't know
 *     (testnet/devnet deployments).
 *
 * The indexer's `token.symbol/name/decimals` are never consulted. If no
 * trusted label can be produced, this throws rather than borrowing one.
 */

import type { Address } from "viem";

import {
  InvalidTokenDecimalsError,
  getERC20Decimals,
  getERC20Name,
  getERC20Symbol,
} from "@/clients/eth-contract/erc20";
import { getRegisteredTokenByAddress } from "@/services/token/tokenService";

import {
  ReserveMismatchError,
  assertReserveMatchesOnChain,
} from "./assertReserveMatchesOnChain";

/**
 * The underlying is proven, but nothing trustworthy can name it: it is absent
 * from the token registry and its contract returned no usable `symbol()`.
 * Falling back to the indexer's string here is exactly the substitution this
 * module exists to prevent, so callers must hard-block instead.
 */
export class UnknownReserveTokenError extends Error {
  readonly code = "UNKNOWN_RESERVE_TOKEN";
}

export interface VerifiedReserveIdentity {
  /**
   * The proven underlying token address. Identical to the address passed in —
   * the assert throws unless the on-chain `underlying` matches it — so callers
   * may treat this as the on-chain value and should use it in place of the
   * indexer-supplied `reserve.token.address`.
   */
  address: Address;
  /** Registry label for `address`, or the token's own `symbol()` as last resort. */
  symbol: string;
  /** Registry name, the token's own `name()`, or the symbol. */
  name: string;
  /** On-chain `decimals()` — the same source the signing path parses against. */
  decimals: number;
  /** Registry icon; undefined for on-chain-derived identities. */
  icon: string | undefined;
  /**
   * Where the label came from. `"onchain"` strings are attacker-influenceable
   * display text (a token contract may return anything); `"registry"` labels
   * are curated in this codebase.
   */
  source: "registry" | "onchain";
}

/**
 * Prove a reserve's identity from on-chain and locally-curated sources.
 *
 * @param trustedAdapterAddress - Env-pinned Aave adapter, the same address the
 *   borrow/repay tx is sent to. Never accept this from a caller-supplied config.
 * @param reserveId - Reserve id being displayed.
 * @param underlying - The reserve's underlying token address as claimed by the
 *   indexer. Proven against the chain before anything is derived from it.
 * @throws {ReserveMismatchError} the claimed underlying isn't what the spoke maps
 *   `reserveId` to.
 * @throws {InvalidTokenDecimalsError} the token reports implausible decimals.
 * @throws {UnknownReserveTokenError} no trusted label exists for the underlying.
 */
export async function verifyReserveIdentity(
  trustedAdapterAddress: Address,
  reserveId: bigint,
  underlying: Address,
): Promise<VerifiedReserveIdentity> {
  // Assert first, matching the borrow path's ordering, so a mismatch surfaces
  // its own error instead of being masked by a parallel RPC rejection.
  await assertReserveMatchesOnChain(
    trustedAdapterAddress,
    reserveId,
    underlying,
  );

  // Read decimals before the registry branch, deliberately: even on a registry
  // hit we never use the registry's copy. The registry is a hand-maintained
  // table; on-chain decimals are what the signed transaction parses against.
  const decimals = await getERC20Decimals(underlying);

  const registered = getRegisteredTokenByAddress(underlying);
  if (registered) {
    return {
      address: underlying,
      symbol: registered.symbol,
      name: registered.name,
      decimals,
      icon: registered.icon,
      source: "registry",
    };
  }

  // Unknown address (typically a testnet deployment). The address is proven and
  // is what drives value, so a misleading `symbol()` here is a display concern
  // only — but it is still bound to the address, unlike the indexer's string.
  const [symbol, name] = await Promise.all([
    getERC20Symbol(underlying),
    getERC20Name(underlying),
  ]);

  if (!symbol) {
    throw new UnknownReserveTokenError(
      `No trusted label for underlying ${underlying}: it is absent from the ` +
        `token registry and its contract returned no usable symbol(). ` +
        `Refusing to fall back to indexer-supplied metadata.`,
    );
  }

  return {
    address: underlying,
    symbol,
    name: name ?? symbol,
    decimals,
    icon: undefined,
    source: "onchain",
  };
}

/**
 * Whether a failure is a deterministic conclusion about the reserve rather than
 * a transient fault. Retrying these only delays the warning, and the UI must
 * present them as an integrity problem rather than "try again".
 */
export function isIntegrityFailure(error: unknown): boolean {
  return (
    error instanceof ReserveMismatchError ||
    error instanceof UnknownReserveTokenError ||
    error instanceof InvalidTokenDecimalsError
  );
}
