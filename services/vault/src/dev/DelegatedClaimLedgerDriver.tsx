/**
 * Dev-only driver for a Ledger depositor-as-claimer run on devnet (#2111).
 * Never merged: lives on test/2111-ledger-claim-driver only.
 *
 * Reads the vault from chain, derives the claimer WOTS keypair, plans and
 * signs the delegated-claim set on the connected wallet, and assembles
 * `artifacts.json` with placeholder BaBe sessions; join-babe-sessions.mjs
 * splices the real ones in afterwards.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  buildVaultContextInputForClaim,
  rebuildDepositTermsForClaim,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  OnChainBtcVaultStatus,
  assertOnChainBtcPubkey,
  findRegistrationRecord,
  getTxHex,
  type VaultClaimableByEvent,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX,
  DelegatedClaimSigningIncompleteError,
  assembleWatchtowerArtifactsFromSignatures,
  assertArtifactsUsableForVault,
  assertTermsMatchVault,
  deriveClaimerWotsKeypair,
  planDelegatedClaimSigning,
  readDelegatedClaimVaultContext,
  signDelegatedClaimPlan,
  summarizeWatchtowerArtifacts,
  type DelegatedClaimSignatures,
  type DelegatedClaimVaultReaders,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { verifyWatchtowerArtifacts } from "@babylonlabs-io/ts-sdk/tbv/core/wasm";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { ethClient } from "@/clients/eth-contract/client";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import { CONTRACTS } from "@/config/contracts";
import { getBTCNetworkForWASM } from "@/config/pegin";

import DelegatedClaimBroadcastPanel from "./DelegatedClaimBroadcastPanel";

const VAULT_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
/** Same window the SDK's claimable-event scan uses per `eth_getLogs` call. */
const PREFLIGHT_LOG_RANGE_BLOCKS = 7_200n;
const SIGNATURES_STORAGE_PREFIX = "dev-claim-sigs:";
const DRY_RUN_BLOCK_NUMBER = 0n;

interface SlimArtifacts {
  tx_graph_json: string;
  verifying_key_hex: string;
  babe_challengers: string[];
  source: { path: string; graphSha256: string };
}

type LogLine = { at: string; text: string; tone: "info" | "ok" | "error" };

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

function loadStoredSignatures(vaultId: string): Map<string, string> {
  const raw = localStorage.getItem(SIGNATURES_STORAGE_PREFIX + vaultId);
  if (!raw) return new Map();
  return new Map(JSON.parse(raw) as [string, string][]);
}

function storeSignatures(
  vaultId: string,
  signatures: DelegatedClaimSignatures,
) {
  localStorage.setItem(
    SIGNATURES_STORAGE_PREFIX + vaultId,
    JSON.stringify([...signatures.entries()]),
  );
}

async function buildReaders(dryRun: boolean): Promise<{
  readers: DelegatedClaimVaultReaders;
  registryReader: ReturnType<typeof getVaultRegistryReader>;
}> {
  const registryReader = getVaultRegistryReader();
  const [
    protocolParamsReader,
    vaultKeeperReader,
    universalChallengerReader,
    operationKeyReader,
  ] = await Promise.all([
    getProtocolParamsReader(),
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
    getOperationKeyReader(),
  ]);
  const shimmedRegistry: DelegatedClaimVaultReaders["registryReader"] = dryRun
    ? {
        getVaultKeyEpochs: (id) => registryReader.getVaultKeyEpochs(id),
        getVaultProviderGenesisBtcPubKey: (...a) =>
          registryReader.getVaultProviderGenesisBtcPubKey(...a),
        getRegistrationRecordsAtBlock: (block) =>
          registryReader.getRegistrationRecordsAtBlock(block),
        // DRY RUN: pretend the vault is redeemed so the read proceeds while
        // it is still Active. Every other field is the chain's.
        getVaultData: async (id) => {
          const vault = await registryReader.getVaultData(id);
          return {
            ...vault,
            basic: { ...vault.basic, status: OnChainBtcVaultStatus.REDEEMED },
          };
        },
        // DRY RUN: synthesize the depositor's redemption log from the
        // registration log, at block 0 (which the artifacts check refuses).
        getVaultClaimableBy: async (id, claimerPk, createdAt) => {
          const records =
            await registryReader.getRegistrationRecordsAtBlock(createdAt);
          const record = findRegistrationRecord(records, id, createdAt);
          const event: VaultClaimableByEvent = {
            blockNumber: DRY_RUN_BLOCK_NUMBER,
            claimerPk: assertOnChainBtcPubkey(claimerPk, "dry-run claimerPk"),
            peginTxHash: record.peginTxHash,
            vaultCoreVersion: record.vaultCoreVersion,
            proverCircuitVersion: record.proverCircuitVersion,
            offchainParamsVersion: record.offchainParamsVersion,
            universalChallengersVersion: record.universalChallengersVersion,
            appVaultKeepersVersion: record.appVaultKeepersVersion,
          };
          return event;
        },
      }
    : registryReader;
  return {
    registryReader,
    readers: {
      registryReader: shimmedRegistry,
      protocolParamsReader,
      vaultKeeperReader,
      universalChallengerReader,
      operationKeyReader,
    },
  };
}

export default function DelegatedClaimLedgerDriver() {
  const btcConnector = useChainConnector("BTC");
  const wallet =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const walletName = btcConnector?.connectedWallet?.name ?? "none";

  const [vaultId, setVaultId] = useState("");
  const [slim, setSlim] = useState<SlimArtifacts | null>(null);
  const [trustedVk, setTrustedVk] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const say = useCallback((text: string, tone: LogLine["tone"] = "info") => {
    setLog((prev) => [
      ...prev,
      { at: new Date().toLocaleTimeString(), text, tone },
    ]);
  }, []);

  const onSlimFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = JSON.parse(await file.text()) as SlimArtifacts;
    setSlim(parsed);
    const outpoint = JSON.parse(parsed.tx_graph_json).pegin_tx.tx.input[0]
      .previous_output as string;
    say(
      `Loaded ${file.name}: ${parsed.babe_challengers.length} challengers, Pre-PegIn ${outpoint}`,
    );
  };

  const preflight = async () => {
    if (!VAULT_ID_PATTERN.test(vaultId)) {
      return say("Enter the vault id as 0x + 64 hex characters", "error");
    }
    try {
      const client = ethClient.getPublicClient();
      const finalized = await client.getBlock({ blockTag: "finalized" });
      const latest = await client.getBlockNumber();
      say(
        `finalized block ${finalized.number} (latest ${latest}, lag ${latest - finalized.number})`,
        "ok",
      );
      const logs = await client.getLogs({
        address: CONTRACTS.BTC_VAULT_REGISTRY,
        fromBlock: finalized.number - PREFLIGHT_LOG_RANGE_BLOCKS + 1n,
        toBlock: finalized.number,
      });
      say(
        `eth_getLogs over ${PREFLIGHT_LOG_RANGE_BLOCKS} blocks OK (${logs.length} logs)`,
        "ok",
      );
      const vault = await getVaultRegistryReader().getVaultData(vaultId as Hex);
      say(
        `vault status ${vault.basic.status} (Redeemed = ${OnChainBtcVaultStatus.REDEEMED}), createdAt ${vault.basic.createdAt}`,
      );
    } catch (error) {
      say(`preflight failed: ${String(error)}`, "error");
    }
  };

  const run = async () => {
    if (!VAULT_ID_PATTERN.test(vaultId)) {
      return say("Enter the vault id as 0x + 64 hex characters", "error");
    }
    if (!wallet) return say("Connect the Ledger Vault wallet first", "error");
    if (!slim) return say("Load the .slim.json for this vault first", "error");
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      const id = vaultId as Hex;
      const { readers, registryReader } = await buildReaders(dryRun);

      const depositorPk = await wallet.getPublicKeyHex();
      say(`wallet ${walletName}, pubkey ${depositorPk}`);

      const read = await readDelegatedClaimVaultContext({
        vaultId: id,
        readers,
      });
      say(
        `context read: pegin ${read.peginTxHash}, htlcVout ${read.htlcVout}, prover circuit ${read.context.proverCircuitVersion}, claimable block ${read.context.claimableEventBlockNumber}, challengers ${read.context.vaultKeeperBtcPubkeys.length}+${read.context.universalChallengerBtcPubkeys.length}`,
        "ok",
      );

      const graphOutpoint = JSON.parse(slim.tx_graph_json).pegin_tx.tx.input[0]
        .previous_output as string;
      const [graphPrePegin] = graphOutpoint.split(":");
      if (
        graphPrePegin !== read.prePeginTxHash.replace(/^0x/, "").toLowerCase()
      ) {
        throw new Error(
          `slim file's graph spends Pre-PegIn ${graphPrePegin}, vault's is ${read.prePeginTxHash}: wrong file for this vault`,
        );
      }

      const mempoolApiUrl = getMempoolApiUrl();
      const fundedPrePeginTxHex = await getTxHex(
        read.prePeginTxHash.replace(/^0x/, ""),
        mempoolApiUrl,
      );
      const vaultContext = buildVaultContextInputForClaim({
        depositorBtcPubKey: read.depositorBtcPubKeyBytes32,
        fundedPrePeginTxHex,
        prePeginTxHash: read.prePeginTxHash,
      });
      const network = getBTCNetworkForWASM();
      const depositTerms = await rebuildDepositTermsForClaim({
        read,
        depositorBtcPubkey: depositorPk,
        fundedPrePeginTxHex,
        siblingReader: registryReader,
        mempoolApiUrl,
        network,
      });
      assertTermsMatchVault(depositTerms, read.context);
      say("deposit terms rebuilt from chain and matched to the vault", "ok");

      say("deriving the claimer WOTS keypair — confirm on the Ledger");
      const wots = await deriveClaimerWotsKeypair({
        btcWallet: wallet,
        vaultContext,
        htlcVout: read.htlcVout,
        txGraphJson: slim.tx_graph_json,
        txGraphVersion: read.context.txGraphVersion,
        expectedWotsPkHash: read.depositorWotsPkHash,
      });
      download(
        `wots_keypair.${vaultId.slice(2, 10)}.json`,
        wots.wotsKeypairJson,
      );
      say(
        `WOTS keypair matches on-chain hash ${wots.pkHash}; downloaded`,
        "ok",
      );

      const vkSource = trustedVk.trim() ? "prover" : "vp-served (TEST ONLY)";
      const trustedVerifyingKeyHex = trustedVk.trim() || slim.verifying_key_hex;
      if (!trustedVk.trim()) {
        say(
          "No trusted verifying key given: using the VP-served one. The trusted-key check is vacuous for this run.",
          "error",
        );
      }
      const placeholderSessions = JSON.stringify(
        Object.fromEntries(
          slim.babe_challengers.map((key) => [
            key,
            { decryptor_artifacts_hex: BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX },
          ]),
        ),
      );
      const plan = await planDelegatedClaimSigning({
        depositorPublicKey: depositorPk,
        btcNetwork: network,
        source: {
          txGraphJson: slim.tx_graph_json,
          verifyingKeyHex: slim.verifying_key_hex,
        },
        trustedVerifyingKeyHex,
        vault: read.context,
        babeSessionsJson: placeholderSessions,
      });
      const kinds = plan.requests.reduce<Record<string, number>>((acc, r) => {
        acc[r.kind] = (acc[r.kind] ?? 0) + 1;
        return acc;
      }, {});
      say(
        `plan: ${plan.requests.length} requests ${JSON.stringify(kinds)}`,
        "ok",
      );

      let resume: DelegatedClaimSignatures = loadStoredSignatures(vaultId);
      if (resume.size > 0)
        say(`resuming with ${resume.size} stored signatures`);
      const unsubscribe = (
        wallet as BitcoinWallet & {
          subscribeSigningProgress?: (
            listener: (progress: unknown) => void,
          ) => () => void;
        }
      ).subscribeSigningProgress?.((progress) =>
        say(`device: ${JSON.stringify(progress)}`),
      );
      let signatures: DelegatedClaimSignatures | undefined;
      try {
        for (;;) {
          try {
            signatures = await signDelegatedClaimPlan(plan, wallet, {
              depositTerms,
              vaultContext,
              resume,
              signal: controller.signal,
            });
            storeSignatures(vaultId, signatures);
            break;
          } catch (error) {
            if (!(error instanceof DelegatedClaimSigningIncompleteError))
              throw error;
            storeSignatures(vaultId, error.signatures);
            resume = error.signatures;
            say(
              `stopped at ${error.failedRequestId}: ${error.signatures.size}/${plan.requests.length} saved. ${error.message}`,
              "error",
            );
            if (
              controller.signal.aborted ||
              !window.confirm(
                `Signing stopped at ${error.failedRequestId}. Retry from where it stopped?`,
              )
            ) {
              throw error;
            }
          }
        }
      } finally {
        unsubscribe?.();
      }
      if (!signatures) throw new Error("signing loop ended without signatures");
      say(`all ${signatures.size} signatures collected and verified`, "ok");

      const artifactsJson = await assembleWatchtowerArtifactsFromSignatures({
        plan,
        signatures,
      });
      const tag = dryRun ? "DRYRUN." : "";
      download(
        `artifacts.placeholder.${tag}${vaultId.slice(2, 10)}.json`,
        artifactsJson,
      );
      await verifyWatchtowerArtifacts(
        read.context.txGraphVersion,
        artifactsJson,
      );
      say("assembled; every signature in the file verifies (WASM)", "ok");

      try {
        await assertArtifactsUsableForVault({
          artifactsJson,
          expectedVaultId: vaultId,
          depositorEthAddress: read.context.depositorEthAddress,
          trustedVerifyingKeyHex,
          expectedProverCircuitVersion: read.context.proverCircuitVersion,
        });
        say(
          "assertArtifactsUsableForVault passed (unexpected with placeholders)",
          "error",
        );
      } catch (error) {
        say(
          `assertArtifactsUsableForVault refused, as expected before the join (${dryRun ? "block 0" : "placeholder sessions"}): ${String(error)}`,
        );
      }

      const summary = summarizeWatchtowerArtifacts(artifactsJson);
      download(
        `handoff.${tag}${vaultId.slice(2, 10)}.json`,
        JSON.stringify(
          {
            dryRun,
            vaultId,
            peginTxid: read.peginTxHash.replace(/^0x/, ""),
            claimTxid: summary.claimTxid,
            claimableEventBlockNumber:
              read.context.claimableEventBlockNumber.toString(),
            proverCircuitVersion: read.context.proverCircuitVersion,
            depositorBtcPubkey: read.context.depositorBtcPubkey,
            vkSource,
            slimSource: slim.source,
          },
          null,
          2,
        ),
      );
      say(
        dryRun
          ? "DRY RUN complete. Signatures are saved for the real run; these artifacts are unusable."
          : "Done. Next: node join-babe-sessions.mjs, then hand artifacts.json + wots_keypair + handoff to the watchtower.",
        "ok",
      );
    } catch (error) {
      let text = "";
      for (
        let current: unknown = error;
        current !== undefined;
        current = current instanceof Error ? current.cause : undefined
      ) {
        let described: string;
        if (current instanceof Error) {
          described = `${current.name}: ${current.message}`;
        } else {
          try {
            described = JSON.stringify(current);
          } catch {
            described = String(current);
          }
        }
        text += `${text ? " <- caused by " : ""}${described}`;
        // DMK errors are plain objects carrying their own `originalError`.
        if (
          !(current instanceof Error) &&
          typeof current === "object" &&
          current !== null &&
          "originalError" in current
        ) {
          text += ` <- original ${String((current as { originalError: unknown }).originalError)}`;
        }
      }
      say(text, "error");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const storedCount = loadStoredSignatures(vaultId).size;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6 font-mono text-sm">
      <h1 className="text-xl font-bold">
        Delegated claim — Ledger driver (dev)
      </h1>
      {dryRun ? (
        <div className="rounded bg-red-700 p-2 text-white">
          DRY RUN — the vault is read as Redeemed with a synthetic block-0
          event. Signatures carry over to the real run; the artifacts do not.
        </div>
      ) : null}
      <div>
        BTC wallet: {walletName}{" "}
        {wallet ? "" : "(connect Ledger Vault via the header)"}
      </div>

      <label className="flex flex-col gap-1">
        Vault id (registry id, not the PegIn txid in the artifacts filename; see
        find-vault-id.mjs)
        <input
          className="border p-1 text-black"
          value={vaultId}
          placeholder="0x…64 hex"
          onChange={(e) => setVaultId(e.target.value.trim())}
        />
      </label>
      <label className="flex flex-col gap-1">
        Slim VP artifacts (.slim.json from slim-vp-artifacts.mjs)
        <input
          type="file"
          accept=".json"
          onChange={(e) => onSlimFile(e.target.files?.[0])}
        />
      </label>
      <label className="flex flex-col gap-1">
        Trusted Groth16 verifying key hex (from the prover; empty = use the
        VP&apos;s, test only)
        <textarea
          className="h-16 border p-1 text-black"
          value={trustedVk}
          onChange={(e) => setTrustedVk(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        Dry run (vault still Active)
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="border px-3 py-1"
          onClick={preflight}
          disabled={running}
        >
          Preflight
        </button>
        <button
          className="border px-3 py-1 font-bold"
          onClick={run}
          disabled={running}
        >
          Run
        </button>
        <button
          className="border px-3 py-1"
          onClick={() => abortRef.current?.abort()}
          disabled={!running}
        >
          Stop
        </button>
        <button
          className="border px-3 py-1"
          onClick={() =>
            download(
              `signatures.${vaultId.slice(2, 10)}.json`,
              JSON.stringify([...loadStoredSignatures(vaultId).entries()]),
            )
          }
        >
          Download saved signatures ({storedCount})
        </button>
        <label className="border px-3 py-1">
          Load signatures
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const entries = JSON.parse(await file.text()) as [
                string,
                string,
              ][];
              storeSignatures(vaultId, new Map(entries));
              say(`loaded ${entries.length} signatures for ${vaultId}`);
            }}
          />
        </label>
        <button
          className="border px-3 py-1"
          onClick={() => {
            localStorage.removeItem(SIGNATURES_STORAGE_PREFIX + vaultId);
            say(`cleared saved signatures for ${vaultId}`);
          }}
          disabled={running}
        >
          Clear saved signatures
        </button>
      </div>

      <div className="flex flex-col gap-1 rounded border p-2">
        {log.map((line, index) => (
          <div
            key={index}
            className={
              line.tone === "error"
                ? "text-red-500"
                : line.tone === "ok"
                  ? "text-green-500"
                  : ""
            }
          >
            [{line.at}] {line.text}
          </div>
        ))}
      </div>

      <DelegatedClaimBroadcastPanel say={say} />
    </div>
  );
}
