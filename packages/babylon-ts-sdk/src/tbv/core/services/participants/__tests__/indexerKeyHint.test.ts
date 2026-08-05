/**
 * The RFC-006 accept-either policy, tested at the level it is defined.
 *
 * The three call sites (deposit, payout, refund) each have their own tests for
 * how they wire this in; these cases pin the policy itself, so a change to it
 * fails here first rather than as three unrelated downstream surprises.
 */

import { describe, expect, it, vi } from "vitest";

import {
  assertVaultProviderHintAccepted,
  isHintAccepted,
  matchKeyHint,
  matchKeySetHint,
} from "../indexerKeyHint";
import { ADDRESSES, KEYS } from "./fixtures/rotation";

describe("isHintAccepted", () => {
  it("accepts a hint explained by the registration key", () => {
    expect(isHintAccepted({ registration: true, operation: false })).toBe(true);
  });

  // The case the whole module exists for: the indexer has caught up to a
  // rotation while the registration getter still returns the original key.
  it("accepts a hint explained by the current operation key", () => {
    expect(isHintAccepted({ registration: false, operation: true })).toBe(true);
  });

  it("accepts a hint for an operator that never rotated", () => {
    expect(isHintAccepted({ registration: true, operation: true })).toBe(true);
  });

  it("rejects a hint no on-chain state explains", () => {
    expect(isHintAccepted({ registration: false, operation: false })).toBe(
      false,
    );
  });
});

describe("matchKeyHint", () => {
  it("reports which candidate a rotated provider's hint matched", () => {
    expect(
      matchKeyHint(KEYS.vpRotated, KEYS.vpGenesis, KEYS.vpRotated),
    ).toEqual({ registration: false, operation: true });
  });

  it("reports both candidates for an operator that never rotated", () => {
    expect(
      matchKeyHint(KEYS.vpGenesis, KEYS.vpGenesis, KEYS.vpGenesis),
    ).toEqual({ registration: true, operation: true });
  });

  it("reports neither candidate for an unrelated key", () => {
    expect(matchKeyHint(KEYS.outsider, KEYS.vpGenesis, KEYS.vpRotated)).toEqual(
      { registration: false, operation: false },
    );
  });

  // The indexer serves 0x-prefixed keys and the schema validator lets
  // uppercase hex through; the on-chain reader returns bare lowercase. Without
  // canonicalization these three spellings of one key compare unequal.
  it("matches across 0x prefixes, compressed form, and letter case", () => {
    expect(
      matchKeyHint(
        `0x${KEYS.vpGenesis.toUpperCase()}`,
        `02${KEYS.vpGenesis}`,
        KEYS.vpRotated,
      ).registration,
    ).toBe(true);
  });
});

describe("matchKeySetHint", () => {
  const registration = [KEYS.keeperAGenesis, KEYS.keeperBGenesis];
  const operation = [KEYS.keeperAGenesis, KEYS.keeperBRotated];

  it("matches a set regardless of the order it arrives in", () => {
    expect(
      matchKeySetHint([...registration].reverse(), registration, operation)
        .registration,
    ).toBe(true);
  });

  it("matches a set that has caught up to a rotation", () => {
    expect(matchKeySetHint(operation, registration, operation)).toEqual({
      registration: false,
      operation: true,
    });
  });

  // A set holding one registration key and one operation key is an indexer
  // halfway through applying a rotation. Per-element membership of the union
  // would wave that through; whole-set equality is what rejects it.
  it("rejects a set mixing registration and operation keys", () => {
    const mixed = [KEYS.keeperBGenesis, KEYS.keeperBRotated];

    expect(matchKeySetHint(mixed, registration, operation)).toEqual({
      registration: false,
      operation: false,
    });
  });

  it("rejects a set of the wrong length", () => {
    expect(
      isHintAccepted(
        matchKeySetHint([KEYS.keeperAGenesis], registration, operation),
      ),
    ).toBe(false);
  });
});

describe("assertVaultProviderHintAccepted", () => {
  const readCurrentOperationBtcPubkey = (key: string) =>
    vi.fn().mockResolvedValue(key);

  it("resolves when the hint matches the registration key", async () => {
    const readOperation = readCurrentOperationBtcPubkey(KEYS.vpRotated);

    await expect(
      assertVaultProviderHintAccepted({
        vaultProviderEthAddress: ADDRESSES.vaultProvider,
        hintBtcPubkey: KEYS.vpGenesis,
        registrationBtcPubkey: KEYS.vpGenesis,
        readCurrentOperationBtcPubkey: readOperation,
      }),
    ).resolves.toBeUndefined();
  });

  // The fallback read is what keeps a rotated provider's depositors working.
  it("resolves when the hint matches the current operation key", async () => {
    await expect(
      assertVaultProviderHintAccepted({
        vaultProviderEthAddress: ADDRESSES.vaultProvider,
        hintBtcPubkey: KEYS.vpRotated,
        registrationBtcPubkey: KEYS.vpGenesis,
        readCurrentOperationBtcPubkey: readCurrentOperationBtcPubkey(
          KEYS.vpRotated,
        ),
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when the hint matches neither key", async () => {
    await expect(
      assertVaultProviderHintAccepted({
        vaultProviderEthAddress: ADDRESSES.vaultProvider,
        hintBtcPubkey: KEYS.outsider,
        registrationBtcPubkey: KEYS.vpGenesis,
        readCurrentOperationBtcPubkey: readCurrentOperationBtcPubkey(
          KEYS.vpRotated,
        ),
      }),
    ).rejects.toThrow(
      "indexer hint matches neither the registration key nor the current operation key",
    );
  });

  it("names the operation that was aborted when given a context", async () => {
    await expect(
      assertVaultProviderHintAccepted({
        vaultProviderEthAddress: ADDRESSES.vaultProvider,
        hintBtcPubkey: KEYS.outsider,
        registrationBtcPubkey: KEYS.vpGenesis,
        readCurrentOperationBtcPubkey: readCurrentOperationBtcPubkey(
          KEYS.vpRotated,
        ),
        context: "Aborting refund.",
      }),
    ).rejects.toThrow("Aborting refund.");
  });

  // The fallback is a second RPC, so it must stay a fallback: the common case
  // is an un-rotated provider whose hint matches on the first compare.
  it("does not read the operation key when the hint matches registration", async () => {
    const readOperation = readCurrentOperationBtcPubkey(KEYS.vpRotated);

    await assertVaultProviderHintAccepted({
      vaultProviderEthAddress: ADDRESSES.vaultProvider,
      hintBtcPubkey: KEYS.vpGenesis,
      registrationBtcPubkey: KEYS.vpGenesis,
      readCurrentOperationBtcPubkey: readOperation,
    });

    expect(readOperation).not.toHaveBeenCalled();
  });

  // Callers that have no indexer value to check pass nothing; the cross-check
  // is an extra guard, never a precondition for reading the chain.
  it("does not read the operation key when there is no hint", async () => {
    const readOperation = readCurrentOperationBtcPubkey(KEYS.vpRotated);

    await assertVaultProviderHintAccepted({
      vaultProviderEthAddress: ADDRESSES.vaultProvider,
      registrationBtcPubkey: KEYS.vpGenesis,
      readCurrentOperationBtcPubkey: readOperation,
    });

    expect(readOperation).not.toHaveBeenCalled();
  });
});
