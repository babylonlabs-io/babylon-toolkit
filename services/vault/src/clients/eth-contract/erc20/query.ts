// ERC20 - Read operations (queries)

import type { Address } from "viem";

import { ethClient } from "../client";

/**
 * Standard ERC20 ABI fragments for common read operations
 */
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/**
 * A token whose on-chain `decimals()` is outside the range any real ERC20 uses.
 * Named so callers can classify it as an integrity conclusion (do not retry)
 * rather than a transient RPC fault.
 */
export class InvalidTokenDecimalsError extends Error {
  readonly code = "INVALID_TOKEN_DECIMALS";
}

/** No real ERC20 exceeds 18; anything above is a misconfigured or hostile token. */
const MAX_REASONABLE_DECIMALS = 18;
/** Display caps for `symbol()` / `name()` — a hostile token can return megabytes. */
const MAX_SYMBOL_LENGTH = 16;
const MAX_NAME_LENGTH = 64;

/**
 * Make an on-chain string safe to render. Strips Unicode "other" code points
 * (control characters, zero-width joiners) that a hostile token could use to
 * spoof a homoglyph of a legitimate symbol, then caps the length.
 *
 * @returns The sanitized string, or null when nothing usable remains.
 */
function sanitizeTokenString(raw: string, maxLength: number): string | null {
  const cleaned = raw.replace(/\p{C}/gu, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

/**
 * Get ERC20 token balance for an address
 * @param tokenAddress - ERC20 token contract address
 * @param holderAddress - Address to check balance for
 * @returns Balance in token's smallest unit (e.g., wei for 18 decimals, smallest unit for 6 decimals)
 */
export async function getERC20Balance(
  tokenAddress: Address,
  holderAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [holderAddress],
  });

  return balance as bigint;
}

/**
 * Get ERC20 token decimals from the contract on-chain.
 *
 * Reads directly from the token contract rather than trusting an external
 * source (e.g. a GraphQL indexer) for this value. Using the wrong decimals
 * in parseUnits would silently produce a different amount than the user
 * intended, so this must be authoritative.
 *
 * @param tokenAddress - ERC20 token contract address
 * @returns Token decimals (e.g. 6 for USDC, 18 for WETH)
 */
export async function getERC20Decimals(tokenAddress: Address): Promise<number> {
  const publicClient = ethClient.getPublicClient();

  const decimals = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    args: [],
  });

  if (decimals > MAX_REASONABLE_DECIMALS) {
    throw new InvalidTokenDecimalsError(
      `Token ${tokenAddress} reported ${decimals} decimals, expected at most ${MAX_REASONABLE_DECIMALS}`,
    );
  }

  return decimals as number;
}

/**
 * Get an ERC20 token's symbol from the contract on-chain.
 *
 * Only for display, and only as a fallback when the address-keyed token
 * registry has no entry: a token contract can return any string it likes, so
 * this is trustworthy exactly as far as the address is — never treat it as
 * proof of what the token is. It is still strictly better than an
 * indexer-supplied symbol, which isn't bound to the address at all.
 *
 * @param tokenAddress - ERC20 token contract address
 * @returns Sanitized symbol, or null when the token returns nothing usable
 */
export async function getERC20Symbol(
  tokenAddress: Address,
): Promise<string | null> {
  const publicClient = ethClient.getPublicClient();

  const symbol = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
    args: [],
  });

  return sanitizeTokenString(symbol as string, MAX_SYMBOL_LENGTH);
}

/**
 * Get an ERC20 token's name from the contract on-chain. Same trust caveats as
 * {@link getERC20Symbol} — display-only, registry-miss fallback.
 *
 * @param tokenAddress - ERC20 token contract address
 * @returns Sanitized name, or null when the token returns nothing usable
 */
export async function getERC20Name(
  tokenAddress: Address,
): Promise<string | null> {
  const publicClient = ethClient.getPublicClient();

  const name = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "name",
    args: [],
  });

  return sanitizeTokenString(name as string, MAX_NAME_LENGTH);
}

/**
 * Get ERC20 token allowance
 * @param tokenAddress - ERC20 token contract address
 * @param ownerAddress - Address that owns the tokens
 * @param spenderAddress - Address that is allowed to spend the tokens
 * @returns Allowance amount in token's smallest unit
 */
export async function getERC20Allowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  return allowance as bigint;
}
