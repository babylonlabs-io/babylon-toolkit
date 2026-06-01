/**
 * Tests for the deposit-flow error mapper.
 *
 * Each test pins one classification branch of `mapDepositError` to the copy it
 * should produce. The mapper is pure, so these run without any React harness.
 */

import {
  JsonRpcError,
  RpcErrorCode,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { mapDepositError } from "../depositErrors";

const ERRORS = COPY.deposit.errors;

class FakeWalletError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("mapDepositError", () => {
  it("maps a coded wallet rejection to the signing-rejected callout", () => {
    const err = new FakeWalletError(
      "CONNECTION_REJECTED",
      "User rejected the PSBT signing request",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.signingRejected);
  });

  it("maps a vault-provider JsonRpcError to its VP title and body", () => {
    const err = new JsonRpcError(
      RpcErrorCode.PEGIN_NOT_FOUND,
      "PegIn not found",
    );
    const result = mapDepositError(err);
    expect(result.title).toBe("Vault Provider Syncing");
    expect(result.body).toContain("hasn't ingested");
  });

  it("maps a registered-version mismatch to the version-changed callout", () => {
    const err = new Error("on-chain version differs");
    err.name = "RegisteredVaultVersionMismatchError";
    expect(mapDepositError(err)).toEqual(ERRORS.versionMismatch);
  });

  it("maps a wallet account change to the account-changed callout", () => {
    const err = new Error(
      "BTC wallet account changed during deposit flow. Please restart.",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.walletAccountChanged);
  });

  it("maps an insufficient-ETH gas error to the insufficient-ETH callout", () => {
    const err = new Error(
      "execution reverted: insufficient funds for gas * price + value",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.insufficientEthForGas);
  });

  it("maps viem's typed InsufficientFundsError (by name) to the insufficient-ETH callout", () => {
    // classifyError keys off viem's error name, so it's robust even when the
    // message wording changes across viem versions.
    const err = Object.assign(new Error("Transaction execution failed"), {
      name: "InsufficientFundsError",
    });
    expect(mapDepositError(err)).toEqual(ERRORS.insufficientEthForGas);
  });

  it("maps a wallet-not-connected error to the wallet callout", () => {
    expect(
      mapDepositError(new Error("BTC or ETH wallet not connected")),
    ).toEqual(ERRORS.walletNotConnected);
  });

  it("maps the resume 'wallet is not connected' phrasing to the wallet callout", () => {
    // Resume WOTS/activation set "BTC wallet is not connected" (note the "is").
    expect(mapDepositError(new Error("BTC wallet is not connected"))).toEqual(
      ERRORS.walletNotConnected,
    );
  });

  it("maps a missing vault provider to the provider-not-found callout", () => {
    expect(mapDepositError(new Error("Vault provider not found"))).toEqual(
      ERRORS.providerNotFound,
    );
  });

  it("maps UTXO-availability failures to the funds-unavailable callout", () => {
    expect(mapDepositError(new Error("No spendable UTXOs available"))).toEqual(
      ERRORS.utxosUnavailable,
    );
    expect(
      mapDepositError(new Error("Failed to load UTXOs: network error")),
    ).toEqual(ERRORS.utxosUnavailable);
  });

  it("maps a broadcast failure to the broadcast callout", () => {
    expect(
      mapDepositError(
        new Error("Failed to broadcast batch Pre-PegIn transaction: timeout"),
      ),
    ).toEqual(ERRORS.broadcastFailed);
  });

  it("classifies a BTC broadcast wrapper over insufficient funds as broadcast, not ETH gas", () => {
    // The flow wraps broadcast errors; the inner text can say "insufficient
    // funds" (BTC-side) — that must not be read as an ETH gas shortfall.
    expect(
      mapDepositError(
        new Error(
          "Failed to broadcast batch Pre-PegIn transaction: insufficient funds",
        ),
      ),
    ).toEqual(ERRORS.broadcastFailed);
  });

  it("classifies a wallet rejection wrapped by the broadcast catch as a signing rejection", () => {
    // The broadcast step re-wraps inner errors in a fresh Error (losing the
    // wallet code), so a rejection there must still be matched by phrasing.
    expect(
      mapDepositError(
        new Error(
          "Failed to broadcast batch Pre-PegIn transaction: User rejected the request",
        ),
      ),
    ).toEqual(ERRORS.signingRejected);
  });

  it("treats a BTC funding shortfall as funds-unavailable, not an ETH gas shortfall", () => {
    // "insufficient funds" without a gas marker is BTC-side, not ETH gas.
    expect(
      mapDepositError(new Error("Insufficient funds: no UTXOs available")),
    ).toEqual(ERRORS.utxosUnavailable);
  });

  it("maps an uncoded user-rejection message to the signing-rejected callout", () => {
    expect(
      mapDepositError(new Error("MetaMask Tx Signature: User denied")),
    ).toEqual(ERRORS.signingRejected);
  });

  it("falls back to the default title with the sanitized message", () => {
    const result = mapDepositError(new Error("some unmapped internal failure"));
    expect(result.title).toBe(ERRORS.defaultTitle);
    expect(result.body).toBe("some unmapped internal failure");
  });

  it("uses genericBody (not the 'Unknown error' sentinel) for opaque throws", () => {
    const result = mapDepositError({});
    expect(result.title).toBe(ERRORS.defaultTitle);
    expect(result.body).toBe(ERRORS.genericBody);
    expect(result.body).not.toBe("[object Object]");
  });

  it("maps the resume WOTS-mismatch (wrong wallet) to its own callout", () => {
    expect(
      mapDepositError(new Error(COPY.deposit.resume.wotsMismatchError)),
    ).toEqual(ERRORS.wrongWalletAccount);
  });
});
