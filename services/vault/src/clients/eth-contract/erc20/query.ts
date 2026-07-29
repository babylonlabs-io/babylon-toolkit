// ERC20 - Read operations (queries)

import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Address,
} from "viem";

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
 * Whether a failed read is the contract's answer rather than a failure to
 * reach it: the method is absent (the call returns no data) or it reverted.
 *
 * The distinction matters because `symbol()` and `name()` are optional in
 * ERC-20. A caller must be able to conclude "this token has no symbol" — a
 * permanent fact worth failing closed on — without a dropped connection
 * producing the same conclusion, which would turn one blip into a permanent
 * error state. viem wraps both in `ContractFunctionExecutionError`, so walk
 * the cause chain rather than matching on the outer class.
 */
function isContractLevelFailure(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  return (
    error.walk(
      (cause) =>
        cause instanceof ContractFunctionZeroDataError ||
        cause instanceof ContractFunctionRevertedError,
    ) !== null
  );
}

/**
 * Read an optional string-returning ERC-20 method.
 *
 * @returns The sanitized value, or null when the token does not implement the
 *   method, reverts, or returns nothing usable.
 * @throws Whatever the transport threw, when the read failed for any reason
 *   other than the contract itself — so a caller can retry it.
 */
async function readOptionalTokenString(
  tokenAddress: Address,
  functionName: "symbol" | "name",
  maxLength: number,
): Promise<string | null> {
  const publicClient = ethClient.getPublicClient();

  let raw: string;
  try {
    raw = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName,
      args: [],
    })) as string;
  } catch (error) {
    if (isContractLevelFailure(error)) return null;
    throw error;
  }

  return sanitizeTokenString(raw, maxLength);
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
 * `symbol()` is optional in ERC-20, so a token that doesn't implement it is a
 * legitimate case, not an error — hence null rather than a throw. A transport
 * failure is a different thing and still throws, so the caller can retry it.
 *
 * @param tokenAddress - ERC20 token contract address
 * @returns Sanitized symbol, or null when the token has no usable symbol
 * @throws On transport failure (network, timeout, rate limit)
 */
export async function getERC20Symbol(
  tokenAddress: Address,
): Promise<string | null> {
  return readOptionalTokenString(tokenAddress, "symbol", MAX_SYMBOL_LENGTH);
}

/**
 * Get an ERC20 token's name from the contract on-chain. Same trust caveats and
 * the same null-vs-throw split as {@link getERC20Symbol}.
 *
 * @param tokenAddress - ERC20 token contract address
 * @returns Sanitized name, or null when the token has no usable name
 * @throws On transport failure (network, timeout, rate limit)
 */
export async function getERC20Name(
  tokenAddress: Address,
): Promise<string | null> {
  return readOptionalTokenString(tokenAddress, "name", MAX_NAME_LENGTH);
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
