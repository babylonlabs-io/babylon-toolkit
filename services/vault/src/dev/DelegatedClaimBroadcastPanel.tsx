/**
 * Dev-only: finishes a delegated claim from the browser, without `vaultd`.
 * Never merged: lives on test/2111-ledger-claim-driver only.
 *
 * From the real run's artifacts file: broadcast Claim, pin the prover's
 * Groth16 proof, finalize and broadcast Assert with the WOTS keypair, then,
 * after `timelockAssert`, finalize and broadcast the Payout. Works on the
 * placeholder-session file: Claim, Assert and Payout never read the BaBe
 * sessions; only a WronglyChallenged response does, and that needs the
 * joined file.
 */

import { pushTx } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { DELEGATED_CLAIM_TX_GRAPH_VERSION } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  attachFinalizedAssert,
  finalizePayout,
  pinPegoutProof,
} from "@babylonlabs-io/ts-sdk/tbv/core/wasm";
import { useState } from "react";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { ethClient } from "@/clients/eth-contract/client";

/** The prover's `networkId.preset` for Sepolia and mainnet (vaultd docs `[prover].network_preset`). */
const PROVER_NETWORK_PRESET = "mainnet";

interface Handoff {
  vaultId: string;
  depositorBtcPubkey: string;
  claimableEventBlockNumber: string;
  proverCircuitVersion: number;
}

interface ArtifactsFields {
  vault_id?: string;
  claim_tx?: string;
  claimable_event_block_number?: number;
  groth16_proof_hex?: string | null;
  assert_tx_hex?: string | null;
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Accepts bare proof hex, or the whole `prover_getProof` JSON reply. */
function extractProofHex(pasted: string, handoff: Handoff | null): string {
  const trimmed = pasted.trim();
  if (!trimmed.startsWith("{")) return trimmed.replace(/^0x/, "");
  const reply = JSON.parse(trimmed) as {
    result?: {
      jobStatus?: unknown;
      proof?: { proof?: string; vaultId?: string; claimerPk?: string };
    };
  };
  const proof = reply.result?.proof;
  if (!proof?.proof) {
    throw new Error(
      `No proof in the reply yet (jobStatus ${JSON.stringify(reply.result?.jobStatus)}); poll getProof again.`,
    );
  }
  if (handoff) {
    if (proof.vaultId?.toLowerCase() !== handoff.vaultId.toLowerCase()) {
      throw new Error(
        `Proof is for vault ${proof.vaultId}, not ${handoff.vaultId}.`,
      );
    }
    if (
      proof.claimerPk?.toLowerCase() !==
      handoff.depositorBtcPubkey.toLowerCase()
    ) {
      throw new Error(
        `Proof is for claimer ${proof.claimerPk}, not ${handoff.depositorBtcPubkey}.`,
      );
    }
  }
  return proof.proof.replace(/^0x/, "");
}

export default function DelegatedClaimBroadcastPanel({
  say,
}: {
  say: (text: string, tone?: "info" | "ok" | "error") => void;
}) {
  const [artifactsJson, setArtifactsJson] = useState<string | null>(null);
  const [wotsKeypairJson, setWotsKeypairJson] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [proverUrl, setProverUrl] = useState("");
  const [proofInput, setProofInput] = useState("");
  const [curl, setCurl] = useState("");
  const [busy, setBusy] = useState(false);

  const fields = (): ArtifactsFields => {
    if (!artifactsJson)
      throw new Error("Load the real run's artifacts file first.");
    return JSON.parse(artifactsJson) as ArtifactsFields;
  };
  const tag = () => (handoff ? handoff.vaultId.slice(2, 10) : "vault");

  const step = async (label: string, action: () => Promise<string>) => {
    setBusy(true);
    try {
      say(`${label}: ${await action()}`, "ok");
    } catch (error) {
      say(
        `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (
    file: File | undefined,
    apply: (text: string) => string,
  ) => {
    if (!file) return;
    try {
      say(apply(await file.text()));
    } catch (error) {
      say(`${file.name}: ${String(error)}`, "error");
    }
  };

  const buildCurl = async () => {
    if (!handoff) return say("Load handoff.<id>.json first.", "error");
    if (!proverUrl.trim()) return say("Enter the prover URL first.", "error");
    const chainId = await ethClient.getPublicClient().getChainId();
    const submit = {
      jsonrpc: "2.0",
      id: 1,
      method: "prover_submitClaimEvent",
      params: [
        {
          circuitVersion: handoff.proverCircuitVersion,
          networkId: { chainId, preset: PROVER_NETWORK_PRESET },
          blockNumber: Number(handoff.claimableEventBlockNumber),
          vaultId: handoff.vaultId,
          claimerBtcPk: handoff.depositorBtcPubkey,
        },
      ],
    };
    const getProof = {
      jsonrpc: "2.0",
      id: 2,
      method: "prover_getProof",
      params: [{ jobId: "<JOB_ID from the first reply>" }],
    };
    const url = proverUrl.trim();
    setCurl(
      `curl -s -X POST '${url}' -H 'content-type: application/json' -d '${JSON.stringify(submit)}'\n\n` +
        `# repeat until jobStatus is "complete" (can take minutes):\n` +
        `curl -s -X POST '${url}' -H 'content-type: application/json' -d '${JSON.stringify(getProof)}'`,
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <h2 className="text-lg font-bold">
        Claim on Bitcoin (after the real run, no vaultd)
      </h2>
      <div>
        Uses the real run&apos;s{" "}
        <code>artifacts.placeholder.&lt;id&gt;.json</code>,{" "}
        <code>wots_keypair.&lt;id&gt;.json</code> and{" "}
        <code>handoff.&lt;id&gt;.json</code>. After pinning,{" "}
        <b>only ever continue from the downloaded pinned/asserted file</b>: the
        WOTS key signs exactly one proof.
      </div>

      <label className="flex flex-col gap-1">
        Artifacts (placeholder, pinned or asserted)
        <input
          type="file"
          accept=".json"
          onChange={(e) =>
            loadFile(e.target.files?.[0], (text) => {
              const parsed = JSON.parse(text) as ArtifactsFields;
              if (!parsed.claimable_event_block_number) {
                throw new Error(
                  "claimable_event_block_number is 0: this is a dry-run file.",
                );
              }
              setArtifactsJson(text);
              return `artifacts loaded: vault ${parsed.vault_id}, block ${parsed.claimable_event_block_number}, proof ${parsed.groth16_proof_hex ? "pinned" : "not pinned"}, assert ${parsed.assert_tx_hex ? "finalized" : "not finalized"}`;
            })
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        WOTS keypair (secret)
        <input
          type="file"
          accept=".json"
          onChange={(e) =>
            loadFile(e.target.files?.[0], (text) => {
              setWotsKeypairJson(text);
              return "WOTS keypair loaded";
            })
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        Handoff
        <input
          type="file"
          accept=".json"
          onChange={(e) =>
            loadFile(e.target.files?.[0], (text) => {
              const parsed = JSON.parse(text) as Handoff & { dryRun?: boolean };
              if (parsed.dryRun) throw new Error("This is a dry-run handoff.");
              setHandoff(parsed);
              return `handoff loaded: vault ${parsed.vaultId}, claimer ${parsed.depositorBtcPubkey}, event block ${parsed.claimableEventBlockNumber}, circuit ${parsed.proverCircuitVersion}`;
            })
          }
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="border px-3 py-1"
          disabled={busy}
          onClick={() =>
            step("Claim broadcast", async () => {
              const claimTx = fields().claim_tx;
              if (!claimTx) throw new Error("artifacts carry no claim_tx");
              return `txid ${await pushTx(claimTx, getMempoolApiUrl())}`;
            })
          }
        >
          1. Broadcast Claim
        </button>
      </div>

      <label className="flex flex-col gap-1">
        Prover JSON-RPC URL (from the prover operator; the prover sends no CORS
        headers, so use curl)
        <input
          className="border p-1 text-black"
          value={proverUrl}
          onChange={(e) => setProverUrl(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="border px-3 py-1" onClick={() => void buildCurl()}>
          2. Show prover curl commands
        </button>
      </div>
      {curl ? (
        <pre className="whitespace-pre-wrap break-all rounded border p-2">
          {curl}
        </pre>
      ) : null}
      <label className="flex flex-col gap-1">
        Proof: the whole getProof reply, or the bare proof hex
        <textarea
          className="h-20 border p-1 text-black"
          value={proofInput}
          onChange={(e) => setProofInput(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="border px-3 py-1"
          disabled={busy}
          onClick={() =>
            step("Pin proof", async () => {
              const current = fields();
              if (current.assert_tx_hex)
                throw new Error("Assert is already finalized in this file.");
              const pinned = await pinPegoutProof(
                DELEGATED_CLAIM_TX_GRAPH_VERSION,
                artifactsJson as string,
                extractProofHex(proofInput, handoff),
              );
              setArtifactsJson(pinned);
              download(`artifacts.pinned.${tag()}.json`, pinned);
              return "proof verifies under the file's verifying key; pinned file downloaded — keep it";
            })
          }
        >
          3. Pin proof
        </button>
        <button
          className="border px-3 py-1"
          disabled={busy}
          onClick={() =>
            step("Assert", async () => {
              if (!fields().groth16_proof_hex)
                throw new Error("Pin the proof first.");
              if (!wotsKeypairJson)
                throw new Error("Load the WOTS keypair first.");
              const asserted = await attachFinalizedAssert(
                DELEGATED_CLAIM_TX_GRAPH_VERSION,
                artifactsJson as string,
                wotsKeypairJson,
              );
              setArtifactsJson(asserted);
              download(`artifacts.asserted.${tag()}.json`, asserted);
              return "finalized; asserted file downloaded — keep it, then broadcast";
            })
          }
        >
          4. Finalize Assert
        </button>
        <button
          className="border px-3 py-1"
          disabled={busy}
          onClick={() =>
            step("Assert broadcast", async () => {
              const assertTx = fields().assert_tx_hex;
              if (!assertTx) throw new Error("Finalize Assert first.");
              return `txid ${await pushTx(assertTx, getMempoolApiUrl())}`;
            })
          }
        >
          5. Broadcast Assert
        </button>
        <button
          className="border px-3 py-1"
          disabled={busy}
          onClick={() =>
            step("Payout broadcast", async () => {
              if (!fields().assert_tx_hex)
                throw new Error("Finalize Assert first.");
              const payoutTx = await finalizePayout(
                DELEGATED_CLAIM_TX_GRAPH_VERSION,
                artifactsJson as string,
              );
              return `txid ${await pushTx(payoutTx, getMempoolApiUrl())}`;
            })
          }
        >
          6. Broadcast Payout (after timelockAssert)
        </button>
      </div>
    </div>
  );
}
