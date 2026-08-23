/**
 * Tests for the deposit-flow error mapper.
 *
 * Each test pins one classification branch of `mapDepositError` to the copy it
 * should produce. The mapper is pure, so these run without any React harness.
 */

import {
  DepositTermsRejectedError,
  PeginRegistrationMissingError,
  PeginRegistrationNotFinalError,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  JsonRpcError,
  OnChainBtcVaultStatus,
  RpcErrorCode,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import {
  COMMISSION_UNAVAILABLE_ERROR,
  mapDepositError,
} from "../depositErrors";
import { DepositorWalletMismatchError } from "../depositorWalletMismatch";
import { VaultLifecycleStateError } from "../vaultLifecycleStateError";

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

  it("maps a finality-gate timeout to the Ethereum-confirmation callout", () => {
    const err = new PeginRegistrationNotFinalError(
      "Peg-in registration did not reach 8 Ethereum confirmations within 600000ms.",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.ethRegistrationNotFinal);
  });

  it("does NOT classify a finality-gate timeout as a broadcast failure", () => {
    // The gate stops the flow before anything reaches Bitcoin. Telling the
    // user their broadcast failed would be the opposite of what happened, and
    // would invite a retry of something that never ran. This is the exact
    // inversion that shipped when the typed error was flattened to a string
    // before reaching the mapper.
    const err = new PeginRegistrationNotFinalError(
      "Peg-in registration did not reach 8 Ethereum confirmations within 600000ms.",
    );
    expect(mapDepositError(err)).not.toEqual(ERRORS.broadcastFailed);
  });

  it("maps a missing registration to the not-visible-on-chain callout", () => {
    const err = new PeginRegistrationMissingError(
      "Vault 0xabc is still not visible on-chain after 11 reads.",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.ethRegistrationMissing);
  });

  it("does not leak the raw vault id for a missing registration", () => {
    const err = new PeginRegistrationMissingError(
      "Vault 0xdeadbeefdeadbeef is still not visible on-chain after 11 reads.",
    );
    expect(JSON.stringify(mapDepositError(err))).not.toContain("0xdeadbeef");
  });

  it("maps a vault-provider JsonRpcError to its VP title and body", () => {
    const err = new JsonRpcError(
      RpcErrorCode.PEGIN_NOT_FOUND,
      "PegIn not found",
    );
    const result = mapDepositError(err);
    expect(result.title).toBe("Vault provider syncing");
    expect(result.body).toContain("hasn't ingested");
  });

  it("maps a BTC wallet liveness failure to the wallet-not-responding callout", () => {
    const err = new Error(COPY.wallet.liveness.unresponsive);
    expect(mapDepositError(err)).toEqual({
      title: COPY.wallet.liveness.errorTitle,
      body: COPY.wallet.liveness.unresponsive,
    });
  });

  it("maps a liveness address mismatch surfaced as a plain string", () => {
    expect(mapDepositError(COPY.wallet.liveness.addressMismatch)).toEqual({
      title: COPY.wallet.liveness.errorTitle,
      body: COPY.wallet.liveness.addressMismatch,
    });
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

  it("maps the facade's unsupported-version prefix to the app-update callout", () => {
    const err = new Error(
      "unsupported tx graph version: 4 (supported: 1, 2, 3)",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.appVersionUnsupported);
  });

  it("maps the preflight guard's user-facing body to the app-update callout", () => {
    // assertVaultCoreVersionSupported throws the copy body; some surfaces
    // (resume broadcast) stringify it before mapping, so match the body.
    expect(mapDepositError(ERRORS.appVersionUnsupported.body)).toEqual(
      ERRORS.appVersionUnsupported,
    );
  });

  it("maps the SDK commission-drift error to the commission-changed callout", () => {
    const err = new Error(
      "Vault provider commission changed since quote: quoted 250 bps, " +
        "chain currently reports 9999 bps (allowed drift 25 bps). " +
        "Please refresh to see the new commission and try again.",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.commissionChanged);
  });

  it("maps the commission-unavailable guard to the commission-unavailable callout", () => {
    const err = new Error(COMMISSION_UNAVAILABLE_ERROR);
    expect(mapDepositError(err)).toEqual(ERRORS.commissionUnavailable);
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

  it("maps a DepositTermsRejectedError instance to the terms-rejected callout", () => {
    const err = new DepositTermsRejectedError("terms outside device envelope");
    expect(mapDepositError(err)).toEqual(ERRORS.depositTermsRejected);
  });

  it("maps the documented structural rejection shape (foreign realm) to the terms-rejected callout", () => {
    // Providers cannot import the SDK class, so the wire contract is the
    // shape: name + reason. The guard must match it without instanceof.
    const err = {
      name: "DepositTermsRejectedError",
      reason: "device-envelope",
      message: "terms outside device envelope",
    };
    expect(mapDepositError(err)).toEqual(ERRORS.depositTermsRejected);
  });

  it("lets a name-only DepositTermsRejectedError shape (contract violation) fall through", () => {
    const err = {
      name: "DepositTermsRejectedError",
      message: "no reason field",
    };
    expect(mapDepositError(err)).not.toEqual(ERRORS.depositTermsRejected);
  });

  it("maps a broadcast-stage lifecycle refusal to the broadcast callout, by type not message", () => {
    // Same user-visible outcome as the generic-message predecessor (whose
    // message contained "broadcast"); the message here deliberately doesn't,
    // so only the typed branch can produce this mapping.
    const err = new VaultLifecycleStateError("resume refused", {
      reason: "invalid-status",
      stage: "broadcast",
      role: "sibling",
      status: OnChainBtcVaultStatus.EXPIRED,
      vaultId: "0xabc",
    });
    expect(mapDepositError(err)).toEqual(ERRORS.broadcastFailed);
  });

  it("does NOT map a presign-stage lifecycle refusal to the broadcast callout", () => {
    // Presign refusals belong to formatPayoutSignatureError; here they keep
    // the raw-message fallback instead of claiming a broadcast failed.
    const err = new VaultLifecycleStateError("presign refused", {
      reason: "ack-window-elapsed",
      stage: "presign",
      role: "target",
      status: OnChainBtcVaultStatus.PENDING,
      vaultId: "0xabc",
    });
    const result = mapDepositError(err);
    expect(result).not.toEqual(ERRORS.broadcastFailed);
    expect(result.title).toBe(ERRORS.defaultTitle);
  });

  it("maps a top-level WALLET_METHOD_NOT_SUPPORTED code to the unsupported-wallet callout", () => {
    const err = new FakeWalletError(
      "WALLET_METHOD_NOT_SUPPORTED",
      "SomeWallet does not support deriveContextHash",
    );
    expect(mapDepositError(err)).toEqual(ERRORS.walletMethodNotSupported);
  });

  it("finds WALLET_METHOD_NOT_SUPPORTED through a broadcast wrapper's cause chain", () => {
    // The broadcast catch re-wraps with { cause }; the coded inner error must
    // beat the "broadcast" substring bucket the wrapper message would hit.
    const inner = new FakeWalletError(
      "WALLET_METHOD_NOT_SUPPORTED",
      "SomeWallet does not support deriveContextHash",
    );
    const wrapped = new Error(
      "Failed to broadcast Pre-PegIn transaction: unsupported",
      { cause: inner },
    );
    expect(mapDepositError(wrapped)).toEqual(ERRORS.walletMethodNotSupported);
  });

  it("maps each typed device-state code to its dedicated copy", () => {
    expect(
      mapDepositError(
        new FakeWalletError(
          "DEVICE_CEREMONY_INVALID",
          "Ledger Vault holds no approved intent on this connection — restart the flow from derivation.",
        ),
      ),
    ).toEqual(ERRORS.deviceCeremonyInvalid);
    expect(
      mapDepositError(
        new FakeWalletError("DEVICE_LOCKED", "Device is locked (0x5515)"),
      ),
    ).toEqual(ERRORS.deviceLocked);
    expect(
      mapDepositError(
        new FakeWalletError(
          "DEVICE_WRONG_APP",
          "The running app does not handle vault instructions — open the Babylon Vault app",
        ),
      ),
    ).toEqual(ERRORS.deviceWrongApp);
  });

  it("lets a top-frame device code win over an inner unsupported-method cause", () => {
    // The provider's typed device error can wrap lower-level causes; the
    // outer, more specific frame must not be shadowed by the walking
    // unsupported-method bucket.
    const err = Object.assign(
      new FakeWalletError(
        "DEVICE_CEREMONY_INVALID",
        "restart the flow from derivation.",
      ),
      {
        cause: new FakeWalletError(
          "WALLET_METHOD_NOT_SUPPORTED",
          "no deriveContextHash",
        ),
      },
    );
    expect(mapDepositError(err)).toEqual(ERRORS.deviceCeremonyInvalid);
  });

  it("lets a top-frame unsupported-method code win over an inner device cause", () => {
    const err = Object.assign(
      new FakeWalletError(
        "WALLET_METHOD_NOT_SUPPORTED",
        "no deriveContextHash",
      ),
      { cause: new FakeWalletError("DEVICE_LOCKED", "Device is locked") },
    );
    expect(mapDepositError(err)).toEqual(ERRORS.walletMethodNotSupported);
  });

  it("finds DEVICE_CEREMONY_INVALID through a broadcast wrapper's cause chain", () => {
    // Without the typed bucket, the wrapper's "broadcast" wording would claim
    // this as "Broadcast failed" — misleading for a device-state error.
    const inner = new FakeWalletError(
      "DEVICE_CEREMONY_INVALID",
      "The device no longer holds the approved intent (SW_BAD_STATE) — restart the flow from derivation.",
    );
    const wrapped = new Error("Failed to broadcast Pre-PegIn transaction", {
      cause: inner,
    });
    expect(mapDepositError(wrapped)).toEqual(ERRORS.deviceCeremonyInvalid);
  });

  it("keeps the VP mapping when a JsonRpcError carries an unrelated unsupported-method cause", () => {
    // Precedence: typed classifications run before the cause walk, so the
    // meaningful outer VP error must win over the nested code.
    const err = Object.assign(
      new JsonRpcError(RpcErrorCode.PEGIN_NOT_FOUND, "PegIn not found"),
      { cause: { code: "WALLET_METHOD_NOT_SUPPORTED" } },
    );
    const result = mapDepositError(err);
    expect(result.title).toBe("Vault provider syncing");
  });

  it("terminates on a cyclic cause chain without classifying it as unsupported-method", () => {
    const err = new Error("cyclic failure");
    (err as { cause?: unknown }).cause = err;
    const result = mapDepositError(err);
    expect(result).not.toEqual(ERRORS.walletMethodNotSupported);
    expect(result.title).toBe(ERRORS.defaultTitle);
  });

  it("honors the cause-walk depth limit for the unsupported-method code", () => {
    // Innermost frame carries the code; wrap it `depth` times so it sits at
    // cause-depth `depth` from the mapped error.
    const chainWithCodeAtDepth = (depth: number): Error => {
      let cur: unknown = { code: "WALLET_METHOD_NOT_SUPPORTED" };
      for (let i = 0; i < depth; i++) {
        cur = new Error(`wrapper ${i}`, { cause: cur });
      }
      return cur as Error;
    };

    expect(mapDepositError(chainWithCodeAtDepth(10))).toEqual(
      ERRORS.walletMethodNotSupported,
    );
    expect(mapDepositError(chainWithCodeAtDepth(11))).not.toEqual(
      ERRORS.walletMethodNotSupported,
    );
  });

  it("lets a typed top-frame rejection win over an inner unsupported-method cause", () => {
    // Outer frame is EIP-1193 4001 with no cancellation wording; the cause
    // carries the unsupported-method code. The rejection is the accurate
    // reading, and the documented invariant is that an inner unsupported
    // code never overrides a meaningful outer error.
    const err = Object.assign(new Error("request failed"), {
      code: 4001,
      cause: new FakeWalletError(
        "WALLET_METHOD_NOT_SUPPORTED",
        "SomeWallet does not support deriveContextHash",
      ),
    });
    expect(mapDepositError(err)).toEqual(ERRORS.signingRejected);
  });

  it("keeps the VP mapping for the vault provider's PEGIN_NOT_FOUND (code 4001) — it is not an EIP-1193 rejection", () => {
    const err = new JsonRpcError(
      RpcErrorCode.PEGIN_NOT_FOUND,
      "PegIn not found",
    );
    expect(mapDepositError(err)).not.toEqual(ERRORS.signingRejected);
    expect(mapDepositError(err).title).toBe(
      COPY.deposit.errors.vp.syncing.title,
    );
  });

  it("maps the typed depositor-wallet mismatch from the terms rebuild to its own callout", () => {
    const err = new DepositorWalletMismatchError({
      vaultId: "0xabc",
      expectedDepositor: "0x1111111111111111111111111111111111111111",
      connectedDepositor: "0x2222222222222222222222222222222222222222",
    });
    expect(mapDepositError(err)).toEqual(ERRORS.wrongDepositorWallet);
  });

  it("classifies a coded-only rejection preserved as a wrapper's cause as a signing rejection", () => {
    // Pins the { cause } side effect at the broadcast wrap sites: a coded
    // rejection whose message carries no cancellation wording used to flatten
    // into the wrapper and read as a broadcast failure.
    const rejection = new FakeWalletError("CONNECTION_REJECTED", "nope");
    const withCause = new Error(
      "Failed to broadcast batch Pre-PegIn transaction: nope",
      { cause: rejection },
    );
    expect(mapDepositError(withCause)).toEqual(ERRORS.signingRejected);

    const withoutCause = new Error(
      "Failed to broadcast batch Pre-PegIn transaction: nope",
    );
    expect(mapDepositError(withoutCause)).toEqual(ERRORS.broadcastFailed);
  });
});
