/**
 * Tests for pending-vault claim collection + post-hoc impact attribution.
 * Filename retained for git-history continuity — the prior "reservation"
 * machinery this used to test has been removed; see the module's top doc.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContractStatus } from "../../../services/deposit/peginState";
import {
  collectPendingVaultClaims,
  findImpactedVaultIds,
  type PendingPeginLike,
  type PendingVaultClaim,
  type UtxoRef,
  type VaultLike,
} from "../reservation";

/**
 * Build a syntactically valid Bitcoin transaction hex that spends a single
 * outpoint `prevTxidLE:prevVout`. Used to seed `unsignedTxHex` fields in
 * fixtures so `collectPendingVaultClaims` can parse real inputs out of them.
 */
function createValidTxHex(prevTxidLE: string, prevVout: number): string {
  const voutHex = prevVout.toString(16).padStart(8, "0");
  const voutLE =
    voutHex.slice(6, 8) +
    voutHex.slice(4, 6) +
    voutHex.slice(2, 4) +
    voutHex.slice(0, 2);
  return (
    "0100000001" +
    prevTxidLE +
    voutLE +
    "6b" +
    "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" +
    "ffffffff" +
    "01" +
    "605af40500000000" +
    "19" +
    "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" +
    "00000000"
  );
}

const TXID_A = "a".repeat(64);
const TXID_B = "b".repeat(64);

describe("reservation utilities", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ==========================================================================
  // collectPendingVaultClaims
  // ==========================================================================

  describe("collectPendingVaultClaims", () => {
    const VAULT_ID_1 = "0x1111";
    const VAULT_ID_2 = "0x2222";

    it("collects claimed outpoints from a PENDING on-chain vault", () => {
      const vault: VaultLike = {
        id: VAULT_ID_1,
        status: ContractStatus.PENDING,
        unsignedPrePeginTx: createValidTxHex(TXID_A, 3),
      };

      const claims = collectPendingVaultClaims({ vaults: [vault] });

      expect(claims).toHaveLength(1);
      expect(claims[0].vaultId).toBe(VAULT_ID_1);
      expect(claims[0].claimedOutpoints).toEqual([{ txid: TXID_A, vout: 3 }]);
    });

    it("collects from a VERIFIED on-chain vault too", () => {
      const vault: VaultLike = {
        id: VAULT_ID_1,
        status: ContractStatus.VERIFIED,
        unsignedPrePeginTx: createValidTxHex(TXID_B, 0),
      };

      const claims = collectPendingVaultClaims({ vaults: [vault] });

      expect(claims).toHaveLength(1);
      expect(claims[0].claimedOutpoints).toEqual([{ txid: TXID_B, vout: 0 }]);
    });

    it("skips on-chain vaults whose status is neither PENDING nor VERIFIED", () => {
      const active: VaultLike = {
        id: VAULT_ID_1,
        status: ContractStatus.ACTIVE,
        unsignedPrePeginTx: createValidTxHex(TXID_A, 0),
      };
      const expired: VaultLike = {
        id: VAULT_ID_2,
        status: ContractStatus.EXPIRED,
        unsignedPrePeginTx: createValidTxHex(TXID_B, 0),
      };

      const claims = collectPendingVaultClaims({ vaults: [active, expired] });

      expect(claims).toHaveLength(0);
    });

    it("collects from locally-stored pending pegins not already on-chain", () => {
      const pegin: PendingPeginLike = {
        id: VAULT_ID_1,
        unsignedTxHex: createValidTxHex(TXID_A, 5),
      };

      const claims = collectPendingVaultClaims({ pendingPegins: [pegin] });

      expect(claims).toHaveLength(1);
      expect(claims[0].vaultId).toBe(VAULT_ID_1);
      expect(claims[0].claimedOutpoints).toEqual([{ txid: TXID_A, vout: 5 }]);
    });

    it("prefers the on-chain vault when a pending pegin's id matches", () => {
      const vault: VaultLike = {
        id: VAULT_ID_1,
        status: ContractStatus.PENDING,
        unsignedPrePeginTx: createValidTxHex(TXID_A, 0),
      };
      const pegin: PendingPeginLike = {
        id: VAULT_ID_1,
        unsignedTxHex: createValidTxHex(TXID_B, 1),
      };

      const claims = collectPendingVaultClaims({
        vaults: [vault],
        pendingPegins: [pegin],
      });

      // Pending pegin is ignored because the id matches an on-chain vault.
      expect(claims).toHaveLength(1);
      expect(claims[0].claimedOutpoints).toEqual([{ txid: TXID_A, vout: 0 }]);
    });

    it("skips pending pegins that have no id or no tx hex", () => {
      const noId: PendingPeginLike = {
        unsignedTxHex: createValidTxHex(TXID_A, 0),
      };
      const noHex: PendingPeginLike = { id: VAULT_ID_1 };

      const claims = collectPendingVaultClaims({
        pendingPegins: [noId, noHex],
      });

      expect(claims).toHaveLength(0);
    });
  });

  // ==========================================================================
  // findImpactedVaultIds
  // ==========================================================================

  describe("findImpactedVaultIds", () => {
    const claim = (vaultId: string, outpoints: UtxoRef[]): PendingVaultClaim =>
      ({ vaultId, claimedOutpoints: outpoints });

    it("returns an empty array when nothing overlaps", () => {
      const selected: UtxoRef[] = [{ txid: TXID_A, vout: 0 }];
      const claims = [claim("0xV1", [{ txid: TXID_B, vout: 0 }])];
      expect(findImpactedVaultIds(selected, claims)).toEqual([]);
    });

    it("returns the claiming vault id when a selected outpoint overlaps", () => {
      const selected: UtxoRef[] = [{ txid: TXID_A, vout: 0 }];
      const claims = [claim("0xV1", [{ txid: TXID_A, vout: 0 }])];
      expect(findImpactedVaultIds(selected, claims)).toEqual(["0xV1"]);
    });

    it("returns ALL sibling vaults that share an outpoint (batched deposits)", () => {
      // Multi-vault batched deposit: every sibling carries the same
      // unsignedPrePeginTx, so reusing one outpoint invalidates them all.
      const selected: UtxoRef[] = [{ txid: TXID_A, vout: 0 }];
      const claims = [
        claim("0xSibling1", [{ txid: TXID_A, vout: 0 }]),
        claim("0xSibling2", [{ txid: TXID_A, vout: 0 }]),
      ];
      expect(new Set(findImpactedVaultIds(selected, claims))).toEqual(
        new Set(["0xSibling1", "0xSibling2"]),
      );
    });

    it("deduplicates when multiple selected outpoints all belong to the same vault", () => {
      const selected: UtxoRef[] = [
        { txid: TXID_A, vout: 0 },
        { txid: TXID_A, vout: 1 },
      ];
      const claims = [
        claim("0xV1", [
          { txid: TXID_A, vout: 0 },
          { txid: TXID_A, vout: 1 },
        ]),
      ];
      expect(findImpactedVaultIds(selected, claims)).toEqual(["0xV1"]);
    });

    it("is case-insensitive on txid comparison", () => {
      const selected: UtxoRef[] = [{ txid: TXID_A.toUpperCase(), vout: 0 }];
      const claims = [claim("0xV1", [{ txid: TXID_A.toLowerCase(), vout: 0 }])];
      expect(findImpactedVaultIds(selected, claims)).toEqual(["0xV1"]);
    });

    it("returns empty when either input is empty", () => {
      expect(findImpactedVaultIds([], [claim("0xV1", [])])).toEqual([]);
      expect(
        findImpactedVaultIds([{ txid: TXID_A, vout: 0 }], []),
      ).toEqual([]);
    });
  });
});
