import { networks, payments } from "bitcoinjs-lib";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import type {
  DepositTerms,
  DepositTermsApprover,
} from "../../../deposit-terms/depositTerms";
import { assertScriptPathSchnorrSignature } from "../../../primitives/psbt/verifyScriptPathSchnorrSignature";
import type { DelegatedClaimPsbtSigner } from "../signDelegatedClaimPlan";
import {
  DelegatedClaimSigningIncompleteError,
  signDelegatedClaimPlan,
} from "../signDelegatedClaimPlan";
import type {
  DelegatedClaimSigningKind,
  DelegatedClaimSigningPlan,
} from "../types";
import {
  DEPOSITOR_PUBKEY,
  DEPOSITOR_XONLY_PUBKEY,
  SIGNER_ADDRESS,
  VAULT_PROVIDER_PUBKEY,
} from "./fixtures/delegatedClaimPsbts";

const wasm = vi.hoisted(() => ({ extractTapScriptSig: vi.fn() }));
vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));
vi.mock("../../../primitives/psbt/verifyScriptPathSchnorrSignature", () => ({
  assertScriptPathSchnorrSignature: vi.fn(),
}));

const VAULT_KEEPER = "aa".repeat(32);
const UNIVERSAL_CHALLENGER = "bb".repeat(32);

function plan(): DelegatedClaimSigningPlan {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  return {
    depositorPublicKey: DEPOSITOR_PUBKEY,
    btcNetwork: "testnet",
    source: { txGraphJson: "{graph}", verifyingKeyHex: "beef" },
    trustedVerifyingKeyHex: "beef",
    vault: {
      depositorBtcPubkey: DEPOSITOR_XONLY_PUBKEY,
      vaultProviderBtcPubkey: VAULT_PROVIDER_PUBKEY,
      vaultKeeperBtcPubkeys: [VAULT_KEEPER],
      universalChallengerBtcPubkeys: [UNIVERSAL_CHALLENGER],
      vaultCoreVersion: 3,
      timelockPegin: 144,
      timelockAssert: 288,
      protocolFeeRate: 2n,
    } as DelegatedClaimSigningPlan["vault"],
    requests: [
      { id: "claim", kind: "claim", psbtBase64: b64("claim"), inputIndex: 0 },
      {
        id: "assert",
        kind: "assert",
        psbtBase64: b64("assert"),
        inputIndex: 0,
      },
      {
        id: "payoutClaimer",
        kind: "payoutClaimer",
        psbtBase64: b64("pc"),
        inputIndex: 1,
      },
      {
        id: "payoutDepositor",
        kind: "payoutDepositor",
        psbtBase64: b64("pd"),
        inputIndex: 0,
      },
      {
        id: "wronglyChallenged:aa:0",
        kind: "wronglyChallenged",
        psbtBase64: b64("w0"),
        inputIndex: 0,
      },
    ],
  };
}

function softwareWallet(): BitcoinWallet {
  return {
    getAddress: vi.fn(() => Promise.resolve(SIGNER_ADDRESS)),
    getPublicKeyHex: vi.fn(() => Promise.resolve(DEPOSITOR_PUBKEY)),
    signPsbt: vi.fn(),
    signPsbts: vi.fn((psbtHexes: string[]) => Promise.resolve(psbtHexes)),
  } as unknown as BitcoinWallet;
}

describe("signDelegatedClaimPlan — software wallet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    wasm.extractTapScriptSig.mockImplementation(
      (psbtBase64: string, i: number) =>
        Promise.resolve(
          `sig:${Buffer.from(psbtBase64, "base64").toString("utf8")}@${i}`,
        ),
    );
  });

  it("signs the whole plan in one batch and keys signatures by request id", async () => {
    const wallet = softwareWallet();
    const sigs = await signDelegatedClaimPlan(plan(), wallet);

    expect(wallet.signPsbts).toHaveBeenCalledTimes(1);
    expect(wallet.signPsbt).not.toHaveBeenCalled();
    expect(Object.fromEntries(sigs)).toEqual({
      claim: "sig:claim@0",
      assert: "sig:assert@0",
      payoutClaimer: "sig:pc@1",
      payoutDepositor: "sig:pd@0",
      "wronglyChallenged:aa:0": "sig:w0@0",
    });
    const options = (wallet.signPsbts as unknown as Mock).mock.calls[0][1];
    for (const option of options) {
      expect(option.autoFinalized).toBe(false);
      expect(option.signInputs[0].useTweakedSigner).toBe(false);
      expect(option.signInputs[0].address).toBe(SIGNER_ADDRESS);
    }
    expect(
      options.map(
        (o: { signInputs: { index: number }[] }) => o.signInputs[0].index,
      ),
    ).toEqual([0, 0, 1, 0, 0]);
  });

  it("refuses to prompt when the wallet is on another account", async () => {
    const wallet = softwareWallet();
    (wallet.getPublicKeyHex as unknown as Mock).mockResolvedValue(
      "02".concat("99".repeat(32)),
    );

    await expect(signDelegatedClaimPlan(plan(), wallet)).rejects.toThrow(
      /depositor key/,
    );
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("makes no wallet call when the signal is already aborted", async () => {
    const wallet = softwareWallet();
    const reason = new Error("left before signing");

    // Nothing collected yet, so the signal's own reason surfaces unwrapped.
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
    expect(wallet.getPublicKeyHex).not.toHaveBeenCalled();
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("stops the sequential fallback before the next prompt once the signal is aborted", async () => {
    const wallet = softwareWallet();
    (wallet as { signPsbts?: unknown }).signPsbts = undefined;
    const controller = new AbortController();
    const cancelled = new Error("user cancelled");
    (wallet.signPsbt as unknown as Mock).mockImplementation(
      (psbtHex: string) => {
        controller.abort(cancelled);
        return Promise.resolve(psbtHex);
      },
    );

    await expect(
      signDelegatedClaimPlan(plan(), wallet, { signal: controller.signal }),
    ).rejects.toBe(cancelled);
    expect(wallet.signPsbt).toHaveBeenCalledTimes(1);
  });

  it("refuses a plan that lists a request id twice before any wallet call", async () => {
    const wallet = softwareWallet();
    const duplicated: DelegatedClaimSigningPlan = {
      ...plan(),
      requests: [...plan().requests, plan().requests[0]],
    };

    await expect(signDelegatedClaimPlan(duplicated, wallet)).rejects.toThrow(
      /request "claim" more than once/,
    );
    expect(wallet.getPublicKeyHex).not.toHaveBeenCalled();
    expect(wallet.getAddress).not.toHaveBeenCalled();
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a plan whose depositor key is not the vault's registered key", async () => {
    const wallet = softwareWallet();
    // secp256k1's 2G: a valid x-only key that is not the vault's depositor.
    const otherKey =
      "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

    await expect(
      signDelegatedClaimPlan(
        { ...plan(), depositorPublicKey: otherKey },
        wallet,
      ),
    ).rejects.toThrow(
      `Plan depositor key ${otherKey} is not the vault's registered depositor key ` +
        `${DEPOSITOR_XONLY_PUBKEY}; the plan was not built for this vault.`,
    );
    expect(wallet.getPublicKeyHex).not.toHaveBeenCalled();
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("throws instead of returning a map when a batch signature fails verification", async () => {
    const wallet = softwareWallet();
    (assertScriptPathSchnorrSignature as unknown as Mock).mockImplementation(
      ({ signatureHex }: { signatureHex: string }) => {
        if (signatureHex === "sig:pc@1")
          throw new Error("signature does not verify");
      },
    );

    await expect(signDelegatedClaimPlan(plan(), wallet)).rejects.toThrow(
      /does not verify/,
    );
    expect(assertScriptPathSchnorrSignature).toHaveBeenCalledWith({
      requestedPsbtHex: Buffer.from("pc", "utf8").toString("hex"),
      signatureHex: "sig:pc@1",
      signerXOnlyPubkeyHex: DEPOSITOR_PUBKEY.slice(2),
      inputIndex: 1,
    });
  });
});

const TERMS = {
  vaultCoreVersion: 3,
  timelockPegin: 144,
  timelockAssert: 288,
  protocolFeeRate: 2n,
  vaultKeeperBtcPubkeys: [VAULT_KEEPER],
  universalChallengerBtcPubkeys: [UNIVERSAL_CHALLENGER],
  // x-only, as the terms carry it; the plan's vault holds the compressed form.
  vaults: [
    { htlcVout: 0, vaultProviderBtcPubkey: VAULT_PROVIDER_PUBKEY.slice(2) },
  ],
} as unknown as DepositTerms;
const CONTEXT = {
  depositorBtcPubkey: Buffer.from(
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "hex",
  ),
  fundingOutpoints: [{ txid: Buffer.from("11".repeat(32), "hex"), vout: 0 }],
};

/** The utf8 tag a fixture PSBT's bytes spell, so device calls can be logged by name. */
function label(psbtHex: string): string {
  return Buffer.from(psbtHex, "hex").toString("utf8");
}

/** Records every wallet call in order; signDelegatedClaimPsbt returns the PSBT unchanged. */
function approvalWallet(
  calls: string[],
): BitcoinWallet & DelegatedClaimPsbtSigner {
  return {
    getAddress: vi.fn(() => {
      calls.push("address");
      return Promise.resolve(SIGNER_ADDRESS);
    }),
    getPublicKeyHex: vi.fn(() => {
      calls.push("pubkey");
      return Promise.resolve(DEPOSITOR_PUBKEY);
    }),
    deriveContextHash: vi.fn(() => {
      calls.push("derive");
      return Promise.resolve("ab".repeat(32));
    }),
    approveDepositTerms: vi.fn(() => {
      calls.push("approve");
      return Promise.resolve();
    }),
    signPsbt: vi.fn(),
    signPsbts: vi.fn(),
    signDelegatedClaimPsbt: vi.fn((hex: string) => {
      calls.push(`sign:${label(hex)}`);
      return Promise.resolve(hex);
    }),
  } as unknown as BitcoinWallet & DelegatedClaimPsbtSigner;
}

describe("signDelegatedClaimPlan — approval-capable wallet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    wasm.extractTapScriptSig.mockImplementation(
      (psbtBase64: string, i: number) =>
        Promise.resolve(
          `sig:${Buffer.from(psbtBase64, "base64").toString("utf8")}@${i}`,
        ),
    );
  });

  it("derives, approves, signs the intent-bound pair, derives again, then signs the rest, one prompt each", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const sigs = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
    });

    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
      "sign:pc",
      "sign:claim",
      "sign:w0",
    ]);
    // Every claim PSBT goes through the capability; the deposit flow's methods stay untouched.
    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
    expect(Object.fromEntries(sigs)).toEqual({
      claim: "sig:claim@0",
      assert: "sig:assert@0",
      payoutClaimer: "sig:pc@1",
      payoutDepositor: "sig:pd@0",
      "wronglyChallenged:aa:0": "sig:w0@0",
    });
  });

  it("verifies every fresh signature against the PSBT it requested before accepting it", async () => {
    const calls: string[] = [];
    await signDelegatedClaimPlan(plan(), approvalWallet(calls), {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
    });

    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    const hex = (s: string) => Buffer.from(b64(s), "base64").toString("hex");
    expect(assertScriptPathSchnorrSignature).toHaveBeenCalledTimes(5);
    expect(assertScriptPathSchnorrSignature).toHaveBeenCalledWith({
      requestedPsbtHex: hex("pc"),
      signatureHex: "sig:pc@1",
      signerXOnlyPubkeyHex: DEPOSITOR_PUBKEY.slice(2),
      inputIndex: 1,
    });
  });

  it("refuses an approval wallet without signDelegatedClaimPsbt before any prompt — the provider must write its own derivation fields", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls) as BitcoinWallet & {
      signDelegatedClaimPsbt?: unknown;
    };
    delete wallet.signDelegatedClaimPsbt;

    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: TERMS,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/signDelegatedClaimPsbt/);
    expect(calls).toEqual([]);
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("accepts a native-segwit depositor: the address check uses the wallet's own compressed key, not the on-chain x-only one", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const nativeSegwit = payments.p2wpkh({
      pubkey: Buffer.from(DEPOSITOR_PUBKEY, "hex"),
      network: networks.testnet,
    }).address;
    (wallet.getAddress as unknown as Mock).mockResolvedValue(nativeSegwit);

    const sigs = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
    });

    expect(sigs.size).toBe(5);
  });

  it("requires deposit terms and a vault context before touching the device", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    await expect(signDelegatedClaimPlan(plan(), wallet)).rejects.toThrow(
      /depositTerms/,
    );
    await expect(
      signDelegatedClaimPlan(plan(), wallet, { depositTerms: TERMS }),
    ).rejects.toThrow(/vaultContext/);
    expect(calls).toEqual([]);
    expect(wallet.getPublicKeyHex).not.toHaveBeenCalled();
  });

  it("refuses a vault context whose depositor key is not the plan's vault's", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const otherDepositor = {
      ...CONTEXT,
      depositorBtcPubkey: Buffer.from("cc".repeat(32), "hex"),
    };

    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: TERMS,
        vaultContext: otherDepositor,
      }),
    ).rejects.toThrow(
      `vaultContext derives from depositor key ${"cc".repeat(32)} but this ` +
        `plan's vault is registered to ${DEPOSITOR_XONLY_PUBKEY}; the device ` +
        `would derive for another depositor.`,
    );
    expect(calls).toEqual([]);
  });

  it("refuses terms the wallet's envelope rejects before the first derivation", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls) as BitcoinWallet &
      DelegatedClaimPsbtSigner &
      DepositTermsApprover;
    const rejected = new Error("device envelope refused the terms");
    wallet.validateDepositTerms = vi.fn(() => {
      calls.push("validate");
      return Promise.reject(rejected);
    });

    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: TERMS,
        vaultContext: CONTEXT,
      }),
    ).rejects.toBe(rejected);
    expect(calls).toEqual(["pubkey", "address", "validate"]);
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
    expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
  });

  it("names the envelope check, not a device step, when a resumed run's terms are refused", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls) as BitcoinWallet &
      DelegatedClaimPsbtSigner &
      DepositTermsApprover;
    const rejected = new Error("device envelope refused the terms");
    wallet.validateDepositTerms = vi.fn(() => Promise.reject(rejected));

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume: new Map([["payoutClaimer", "sig:pc@1"]]),
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    expect((failure as DelegatedClaimSigningIncompleteError).message).toBe(
      'Delegated-claim signing stopped before "assert" while checking the ' +
        "deposit terms against the wallet's envelope; 1 of 5 signatures were collected.",
    );
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
  });

  it("refuses terms whose rosters differ from the vault's", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = {
      ...TERMS,
      universalChallengerBtcPubkeys: ["cc".repeat(32)],
    } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/rosters/);
    expect(calls).toEqual([]);
    expect(wallet.getPublicKeyHex).not.toHaveBeenCalled();
  });

  it("refuses terms whose vault core version differs from the vault's", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = { ...TERMS, vaultCoreVersion: 2 } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(
      /vault core version 2 but the vault context has version 3/,
    );
    expect(calls).toEqual([]);
  });

  it("refuses terms whose PegIn timelock differs from the plan's vault", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = { ...TERMS, timelockPegin: 288 } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/timelockPegin 288 but the vault context has 144/);
    expect(calls).toEqual([]);
  });

  it("refuses terms whose Assert timelock differs from the plan's vault", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = { ...TERMS, timelockAssert: 144 } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/timelockAssert 144 but the vault context has 288/);
    expect(calls).toEqual([]);
  });

  it("refuses terms whose protocol fee rate differs from the plan's vault", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = { ...TERMS, protocolFeeRate: 5n } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/protocolFeeRate 5 but the vault context has 2/);
    expect(calls).toEqual([]);
  });

  it("refuses terms with a group naming a different vault provider", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = {
      ...TERMS,
      vaults: [
        ...TERMS.vaults,
        { htlcVout: 1, vaultProviderBtcPubkey: "88".repeat(32) },
      ],
    } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/group at htlcVout 1 names a different vault provider/);
    expect(calls).toEqual([]);
  });

  it("refuses terms that describe no vault group", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const wrong = { ...TERMS, vaults: [] } as typeof TERMS;
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: wrong,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/describe no vault group/);
    expect(calls).toEqual([]);
  });

  it("refuses a plan that lists a request id twice before any wallet call", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const duplicated: DelegatedClaimSigningPlan = {
      ...plan(),
      requests: [...plan().requests, plan().requests[0]],
    };

    await expect(
      signDelegatedClaimPlan(duplicated, wallet, {
        depositTerms: TERMS,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/request "claim" more than once/);
    expect(calls).toEqual([]);
  });

  it("makes no wallet call when the signal is already aborted", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const reason = new Error("left before signing");

    // Nothing collected yet, so the signal's own reason surfaces unwrapped.
    await expect(
      signDelegatedClaimPlan(plan(), wallet, {
        depositTerms: TERMS,
        vaultContext: CONTEXT,
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
    expect(calls).toEqual([]);
  });

  it("rejects a plan with a request kind it cannot place in the ceremony before any wallet call", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const withUnknownKind: DelegatedClaimSigningPlan = {
      ...plan(),
      requests: [
        ...plan().requests,
        {
          id: "mystery",
          kind: "mystery" as DelegatedClaimSigningKind,
          psbtBase64: Buffer.from("mystery", "utf8").toString("base64"),
          inputIndex: 0,
        },
      ],
    };

    await expect(
      signDelegatedClaimPlan(withUnknownKind, wallet, {
        depositTerms: TERMS,
        vaultContext: CONTEXT,
      }),
    ).rejects.toThrow(/6 signing requests but only 5/);
    expect(calls).toEqual([]);
  });

  it("reports the partial map when the signal aborts after a signature has been collected", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const controller = new AbortController();
    (wallet.signDelegatedClaimPsbt as unknown as Mock).mockImplementation(
      (hex: string) => {
        const name = label(hex);
        calls.push(`sign:${name}`);
        if (name === "pc") controller.abort(new Error("user left"));
        return Promise.resolve(hex);
      },
    );

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      signal: controller.signal,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.failedRequestId).toBe("claim");
    expect(incomplete.cause).toBe(controller.signal.reason);
    expect([...incomplete.signatures.keys()]).toEqual([
      "assert",
      "payoutDepositor",
      "payoutClaimer",
    ]);
    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
      "sign:pc",
    ]);
  });

  it("reports the resumed standalone signature and the first unresumed request when the signal aborts during the second derivation", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const controller = new AbortController();
    (wallet.deriveContextHash as unknown as Mock).mockImplementation(() => {
      calls.push("derive");
      if (calls.filter((c) => c === "derive").length === 2)
        controller.abort(new Error("user left"));
      return Promise.resolve("ab".repeat(32));
    });
    const resume = new Map([["payoutClaimer", "sig:pc@1"]]);

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume,
      signal: controller.signal,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.failedRequestId).toBe("claim");
    expect(incomplete.cause).toBe(controller.signal.reason);
    expect(Object.fromEntries(incomplete.signatures)).toEqual({
      payoutClaimer: "sig:pc@1",
      assert: "sig:assert@0",
      payoutDepositor: "sig:pd@0",
    });
    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
    ]);
  });

  it("names the opening derive as clearing any loaded intent when a resumed run fails there", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const deviceError = new Error("device refused the derivation");
    (wallet.deriveContextHash as unknown as Mock).mockRejectedValue(
      deviceError,
    );

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume: new Map([["claim", "sig:claim@0"]]),
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    // A fresh device holds no intent at this point, so it is not a release.
    expect((failure as DelegatedClaimSigningIncompleteError).message).toBe(
      'Delegated-claim signing stopped before "assert" while clearing any loaded intent; 1 of 5 signatures were collected.',
    );
  });

  it("reports the intent-bound signatures when the second derivation itself fails", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const deviceError = new Error("device refused the derivation");
    (wallet.deriveContextHash as unknown as Mock).mockImplementation(() => {
      calls.push("derive");
      const secondDerive = calls.filter((c) => c === "derive").length === 2;
      return secondDerive
        ? Promise.reject(deviceError)
        : Promise.resolve("ab".repeat(32));
    });

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.cause).toBe(deviceError);
    expect(incomplete.failedRequestId).toBe("payoutClaimer");
    expect(incomplete.message).toBe(
      'Delegated-claim signing stopped before "payoutClaimer" while releasing the loaded intent; 2 of 5 signatures were collected.',
    );
    expect(Object.fromEntries(incomplete.signatures)).toEqual({
      assert: "sig:assert@0",
      payoutDepositor: "sig:pd@0",
    });
    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
    ]);
  });

  it("still runs the release derive with every standalone signature resumed, and reports its failure against the first standalone request", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const deviceError = new Error("device refused the derivation");
    (wallet.deriveContextHash as unknown as Mock).mockImplementation(() => {
      calls.push("derive");
      const secondDerive = calls.filter((c) => c === "derive").length === 2;
      return secondDerive
        ? Promise.reject(deviceError)
        : Promise.resolve("ab".repeat(32));
    });
    const resume = new Map([
      ["payoutClaimer", "sig:pc@1"],
      ["claim", "sig:claim@0"],
      ["wronglyChallenged:aa:0", "sig:w0@0"],
    ]);

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.cause).toBe(deviceError);
    expect(incomplete.failedRequestId).toBe("payoutClaimer");
    expect(incomplete.message).toBe(
      'Delegated-claim signing stopped before "payoutClaimer" while releasing the loaded intent; 5 of 5 signatures were collected.',
    );
    expect(Object.fromEntries(incomplete.signatures)).toEqual({
      payoutClaimer: "sig:pc@1",
      claim: "sig:claim@0",
      "wronglyChallenged:aa:0": "sig:w0@0",
      assert: "sig:assert@0",
      payoutDepositor: "sig:pd@0",
    });
    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
    ]);
  });

  it("returns what it collected when a standalone signature fails, and a retry reuses only verified standalone ones", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    (wallet.signDelegatedClaimPsbt as unknown as Mock).mockImplementation(
      (hex: string) => {
        const name = label(hex);
        calls.push(`sign:${name}`);
        return name === "claim"
          ? Promise.reject(new Error("user cancelled"))
          : Promise.resolve(hex);
      },
    );

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.failedRequestId).toBe("claim");
    // A failure inside the wallet prompt names the request itself, with no phase.
    expect(incomplete.message).toBe(
      'Delegated-claim signing stopped at "claim"; 3 of 5 signatures were collected.',
    );
    expect([...incomplete.signatures.keys()]).toEqual([
      "assert",
      "payoutDepositor",
      "payoutClaimer",
    ]);

    calls.length = 0;
    (wallet.signDelegatedClaimPsbt as unknown as Mock).mockImplementation(
      (hex: string) => {
        calls.push(`sign:${label(hex)}`);
        return Promise.resolve(hex);
      },
    );
    const sigs = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume: incomplete.signatures,
    });

    // Intent-bound signatures are never resumed; the verified claimer payout is.
    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
      "sign:claim",
      "sign:w0",
    ]);
    expect(assertScriptPathSchnorrSignature).toHaveBeenCalledWith(
      expect.objectContaining({ signatureHex: "sig:pc@1", inputIndex: 1 }),
    );
    expect(sigs.size).toBe(5);
    expect(sigs.get("payoutClaimer")).toBe("sig:pc@1");
  });

  it("re-signs a resumed standalone signature that fails verification instead of reusing it", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    (assertScriptPathSchnorrSignature as unknown as Mock).mockImplementation(
      ({ signatureHex }: { signatureHex: string }) => {
        if (signatureHex === "stale")
          throw new Error("signature does not verify");
      },
    );
    const resume = new Map([["payoutClaimer", "stale"]]);

    const sigs = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume,
    });

    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
      "derive",
      "sign:pc",
      "sign:claim",
      "sign:w0",
    ]);
    expect(sigs.get("payoutClaimer")).toBe("sig:pc@1");
  });

  it("drops resumed intent-bound signatures without verifying them", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const resume = new Map([
      ["assert", "resumed-assert"],
      ["payoutDepositor", "resumed-pd"],
    ]);

    const sigs = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume,
    });

    expect(assertScriptPathSchnorrSignature).not.toHaveBeenCalledWith(
      expect.objectContaining({ signatureHex: "resumed-assert" }),
    );
    expect(assertScriptPathSchnorrSignature).not.toHaveBeenCalledWith(
      expect.objectContaining({ signatureHex: "resumed-pd" }),
    );
    expect(calls).toContain("sign:assert");
    expect(calls).toContain("sign:pd");
    expect(sigs.get("assert")).toBe("sig:assert@0");
    expect(sigs.get("payoutDepositor")).toBe("sig:pd@0");
  });

  it("names the approval phase, not the first request, when a resumed run fails in approveDepositTerms", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    const deviceError = new Error("device refused the terms");
    (
      wallet as unknown as { approveDepositTerms: Mock }
    ).approveDepositTerms.mockRejectedValue(deviceError);

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
      resume: new Map([["payoutClaimer", "sig:pc@1"]]),
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.failedRequestId).toBe("assert");
    expect(incomplete.message).toBe(
      'Delegated-claim signing stopped before "assert" while approving the deposit terms; 1 of 5 signatures were collected.',
    );
    expect(incomplete.cause).toBe(deviceError);
  });

  it("stops with the partial map when a fresh signature fails verification", async () => {
    const calls: string[] = [];
    const wallet = approvalWallet(calls);
    (assertScriptPathSchnorrSignature as unknown as Mock).mockImplementation(
      ({ signatureHex }: { signatureHex: string }) => {
        if (signatureHex === "sig:pd@0")
          throw new Error("signature does not verify");
      },
    );

    const failure = await signDelegatedClaimPlan(plan(), wallet, {
      depositTerms: TERMS,
      vaultContext: CONTEXT,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(DelegatedClaimSigningIncompleteError);
    const incomplete = failure as DelegatedClaimSigningIncompleteError;
    expect(incomplete.failedRequestId).toBe("payoutDepositor");
    expect([...incomplete.signatures.keys()]).toEqual(["assert"]);
    expect(calls).toEqual([
      "pubkey",
      "address",
      "derive",
      "approve",
      "sign:assert",
      "sign:pd",
    ]);
  });
});
