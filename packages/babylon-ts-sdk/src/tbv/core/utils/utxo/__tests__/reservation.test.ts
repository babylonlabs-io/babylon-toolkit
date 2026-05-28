import { describe, expect, it } from "vitest";

import { ContractStatus } from "../../../services/deposit/peginState";
import {
  findOverlappingPendingVaults,
  type PendingPeginLike,
  type VaultLike,
} from "../reservation";

/** Build a valid 1-input BTC tx hex spending `prevTxidLE:prevVout`. */
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

describe("findOverlappingPendingVaults", () => {
  it("returns the id of a PENDING vault whose input overlaps", () => {
    const vault: VaultLike = {
      id: "0xVault1",
      status: ContractStatus.PENDING,
      unsignedPrePeginTx: createValidTxHex(TXID_A, 0),
    };
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A, vout: 0 }],
      vaults: [vault],
    });
    expect(result).toEqual(["0xVault1"]);
  });

  it("returns empty when no PENDING vault overlaps", () => {
    const vault: VaultLike = {
      id: "0xVault1",
      status: ContractStatus.PENDING,
      unsignedPrePeginTx: createValidTxHex(TXID_B, 0),
    };
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A, vout: 0 }],
      vaults: [vault],
    });
    expect(result).toEqual([]);
  });

  it("skips non-PENDING vaults — their pre-pegin BTC tx is confirmed", () => {
    const verified: VaultLike = {
      id: "0xVault1",
      status: ContractStatus.VERIFIED,
      unsignedPrePeginTx: createValidTxHex(TXID_A, 0),
    };
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A, vout: 0 }],
      vaults: [verified],
    });
    expect(result).toEqual([]);
  });

  it("uses local pending pegins as a fallback when not yet indexed", () => {
    const pegin: PendingPeginLike = {
      id: "0xVault1",
      unsignedTxHex: createValidTxHex(TXID_A, 0),
    };
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A, vout: 0 }],
      pendingPegins: [pegin],
    });
    expect(result).toEqual(["0xVault1"]);
  });

  it("prefers the on-chain vault when a local pegin shares its id", () => {
    // Local entry would NOT overlap; on-chain entry WOULD. The on-chain
    // copy must win, so the result must include the vault.
    const vault: VaultLike = {
      id: "0xVault1",
      status: ContractStatus.PENDING,
      unsignedPrePeginTx: createValidTxHex(TXID_A, 0),
    };
    const localStaleCopy: PendingPeginLike = {
      id: "0xVault1",
      unsignedTxHex: createValidTxHex(TXID_B, 0),
    };
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A, vout: 0 }],
      vaults: [vault],
      pendingPegins: [localStaleCopy],
    });
    expect(result).toEqual(["0xVault1"]);
  });

  it("returns all sibling vaults of a batched deposit that share an outpoint", () => {
    // Batched deposit: every sibling vault carries the same Pre-PegIn,
    // so a shared outpoint invalidates them all.
    const sibling = (id: string): VaultLike => ({
      id,
      status: ContractStatus.PENDING,
      unsignedPrePeginTx: createValidTxHex(TXID_A, 0),
    });
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A, vout: 0 }],
      vaults: [sibling("0xS1"), sibling("0xS2")],
    });
    expect(new Set(result)).toEqual(new Set(["0xS1", "0xS2"]));
  });

  it("matches txids case-insensitively", () => {
    const vault: VaultLike = {
      id: "0xVault1",
      status: ContractStatus.PENDING,
      unsignedPrePeginTx: createValidTxHex(TXID_A.toLowerCase(), 0),
    };
    const result = findOverlappingPendingVaults({
      selectedOutpoints: [{ txid: TXID_A.toUpperCase(), vout: 0 }],
      vaults: [vault],
    });
    expect(result).toEqual(["0xVault1"]);
  });
});
