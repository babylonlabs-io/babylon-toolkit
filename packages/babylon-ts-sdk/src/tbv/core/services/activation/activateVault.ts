/**
 * Vault activation — reveal HTLC secret on Ethereum to move the vault from
 * Verified to Active. The on-chain contract validates `sha256(s) == hashlock`
 * and the activation deadline; this function pre-validates inputs (including
 * an optional hashlock check) and delegates the actual contract write to an
 * injected callback so the SDK stays transport-agnostic.
 *
 * @module services/activation
 */

import type { Abi, Address, Hash, Hex } from "viem";

import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";
import { ensureHexPrefix } from "../../primitives/utils/bitcoin";
import { validateSecretAgainstHashlock } from "../htlc";

const BYTES32_HEX_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_HEX_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_BYTES_RE = /^0x([0-9a-fA-F]{2})*$/;

function assertBytes32(value: string, label: string): void {
  if (value.length !== 66) {
    throw new Error(
      `${label} must be 32 bytes (66 hex chars with 0x prefix), got length ${value.length}`,
    );
  }
  if (!BYTES32_HEX_RE.test(value)) {
    throw new Error(
      `${label} must contain only hex characters after the 0x prefix`,
    );
  }
}

function assertAddress(value: string, label: string): void {
  if (!ADDRESS_HEX_RE.test(value)) {
    throw new Error(
      `${label} must be a 20-byte 0x-prefixed hex address (42 chars)`,
    );
  }
}

function assertHexBytes(value: string, label: string): void {
  if (!HEX_BYTES_RE.test(value)) {
    throw new Error(
      `${label} must be a 0x-prefixed hex string with an even number of hex chars`,
    );
  }
}

/**
 * A single ETH contract-write call. The SDK assembles these; the caller
 * executes them via viem, wagmi, a wallet provider, or any other transport.
 */
export interface EthContractWriteCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * Minimum shape the SDK requires from any contract-write result. Callers may
 * return richer objects (e.g. including the receipt) — the SDK propagates
 * them unchanged via the generic parameter on {@link EthContractWriter}.
 */
export interface EthContractWriteResult {
  transactionHash: Hash;
}

/**
 * Caller-provided contract writer. The generic `R` lets callers return any
 * transport-specific result shape (e.g. `{ transactionHash, receipt }`);
 * the SDK forwards that shape back through `activateVault`.
 */
export type EthContractWriter<R extends EthContractWriteResult = EthContractWriteResult> = (
  call: EthContractWriteCall,
) => Promise<R>;

export interface ActivateVaultInput<
  R extends EthContractWriteResult = EthContractWriteResult,
> {
  /** BTCVaultRegistry contract address (env-specific). */
  btcVaultRegistryAddress: Address;
  /** Vault ID (bytes32, 0x-prefixed). */
  vaultId: Hex;
  /**
   * HTLC secret preimage (bytes32). A missing `0x` prefix or an uppercase
   * `0X` prefix is normalised before validation.
   */
  secret: string;
  /**
   * Optional hashlock for client-side pre-validation. When provided, the SDK
   * rejects before calling `writeContract` if `sha256(secret) != hashlock`.
   */
  hashlock?: Hex;
  /**
   * Optional activation metadata passed through to the contract. Must be a
   * 0x-prefixed hex string; defaults to `"0x"` (empty bytes), matching
   * today's usage.
   */
  activationMetadata?: Hex;
  /** Caller-provided write callback — see {@link EthContractWriter}. */
  writeContract: EthContractWriter<R>;
  /**
   * Optional abort signal. Checked before validation runs; since validation
   * is fully synchronous, cancellation between validation and the write is
   * not observable and callers should rely on the transport's own
   * cancellation support for that window.
   */
  signal?: AbortSignal;
}

/**
 * Reveal the HTLC secret on Ethereum and activate the vault.
 *
 * Validates inputs, optionally pre-checks the secret against the expected
 * hashlock, and delegates the contract write to `writeContract`. Returns
 * whatever the writer returns so callers can keep richer transport-specific
 * metadata (e.g. viem receipts) end-to-end.
 *
 * @throws `Error` if `btcVaultRegistryAddress` is not a valid 20-byte address
 * @throws `Error` if `vaultId` or `secret` is not a valid 32-byte hex
 * @throws `Error` if `hashlock` is provided and is not a valid 32-byte hex,
 *         or if `sha256(secret) != hashlock`
 * @throws `Error` if `activationMetadata` is provided and is not a 0x-prefixed
 *         hex byte string (must have an even number of hex chars)
 * @throws whatever the injected `writeContract` throws
 * @throws `AbortError` / caller-provided abort reason if `signal` aborts
 */
export async function activateVault<
  R extends EthContractWriteResult = EthContractWriteResult,
>(input: ActivateVaultInput<R>): Promise<R> {
  const {
    btcVaultRegistryAddress,
    vaultId,
    hashlock,
    activationMetadata,
    writeContract,
    signal,
  } = input;

  signal?.throwIfAborted();

  assertAddress(btcVaultRegistryAddress, "btcVaultRegistryAddress");
  assertBytes32(vaultId, "vaultId");

  const normalizedSecret = ensureHexPrefix(input.secret);
  assertBytes32(normalizedSecret, "secret");

  if (hashlock !== undefined) {
    assertBytes32(hashlock, "hashlock");
    if (!validateSecretAgainstHashlock(normalizedSecret, hashlock)) {
      throw new Error(
        "Invalid secret: SHA256(secret) does not match the provided hashlock",
      );
    }
  }

  const metadata = activationMetadata ?? "0x";
  if (activationMetadata !== undefined) {
    assertHexBytes(activationMetadata, "activationMetadata");
  }

  return writeContract({
    address: btcVaultRegistryAddress,
    abi: BTCVaultRegistryABI,
    functionName: "activateVaultWithSecret",
    args: [vaultId, normalizedSecret, metadata],
  });
}
