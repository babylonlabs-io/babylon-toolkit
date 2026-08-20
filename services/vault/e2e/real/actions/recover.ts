/**
 * Rehearsal for the ETH-reorg recovery path (#2203), against a real wallet and
 * a real signet vault.
 *
 * There is nothing to simulate. A reorg's entire observable effect on our code
 * is that `vaultId`-keyed reads come back empty, and the recovery path is
 * written never to make them. So the rehearsal runs recovery against a vault
 * whose row is still there, refusing to use that row as input — and then diffs
 * the blind answer against it. That is stronger evidence than an actual
 * incident could give, because during one there would be nothing to compare to.
 *
 * What is genuinely blind here, and is the point of the exercise:
 *
 *   - the depositor's BTC pubkey comes from the connected wallet, not the row
 *   - the vault count comes from the transaction's auth-anchor OP_RETURN vout
 *   - the hashlocks are re-derived through the wallet's `deriveContextHash`
 *   - the peg-in amounts are inverted from the funded HTLC output values
 *
 * What is supplied rather than searched, and is logged as such: the version
 * stamps and the vault provider. Enumerating those is the fallback path and is
 * already covered by unit tests; the unverified claim worth a real wallet is
 * whether a live wallet's derivation reproduces a vault's on-chain hashlock.
 *
 * Nothing is broadcast. The refund is built and compared, never sent.
 */
import {
  buildAndBroadcastRefund,
  buildPeginParamsCandidates,
  calculateBtcTxHash,
  deriveHashlocksFromPrePegin,
  processPublicKeyToXOnly,
  reconstructPeginParams,
  resolveCurrentParticipantKeys,
  resolveProtocolAddresses,
  toRefundInputs,
  ViemOperationKeyReader,
  ViemProtocolParamsReader,
  ViemUniversalChallengerReader,
  ViemVaultKeeperReader,
  ViemVaultRegistryReader,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { gql } from "graphql-request";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";

import type { NetworkName } from "../config";
import {
  createGraphQLClient,
  resolveNetworkContracts,
} from "../networkContracts";

import { installPopupApprover, sweepApprovals } from "./approver";
import type { Action, ActionContext } from "./types";

/** Injected-provider path per BTC wallet, mirroring sign-conformance. */
const PROVIDER_PATH: Record<string, string> = {
  unisat: "unisat",
  okx: "okxwallet.bitcoinSignet",
};

/** A wallet approval plus HKDF is slow; well past any human-free popup click. */
const WALLET_CALL_TIMEOUT_MS = 120_000;

/** Fee rate for the rehearsal's refund. Never broadcast, so it only has to be plausible. */
const REFUND_FEE_RATE_SAT_VB = 2;

/**
 * The WASM network descriptor, taken from the SDK's own signature rather than
 * imported from the WASM package (not a direct dependency of this project).
 */
type BtcNetwork = Parameters<typeof reconstructPeginParams>[0]["network"];

/**
 * BTC network per harness network, typed rather than cast. The value reaches
 * HTLC script construction, so a wrong one silently builds against the wrong
 * script tree; `as never` would hide exactly that.
 */
const BTC_NETWORK: Record<NetworkName, BtcNetwork> = {
  devnet: "signet" as BtcNetwork,
  testnet: "signet" as BtcNetwork,
};

/**
 * The commission ceiling the rehearsal declares. It never reaches the HTLC
 * script or value, so for a rehearsal the widest admissible bound is right:
 * `buildDepositTerms` requires an integer strictly below 10_000.
 */
const REHEARSAL_MAX_COMMISSION_BPS = 9_999;

/** One unresponsive Esplora request must not hang the rehearsal indefinitely. */
const ESPLORA_TIMEOUT_MS = 15_000;

/** Public signet Esplora, used only to price the Pre-PegIn's inputs. */
const DEFAULT_BTC_API = "https://mempool.space/signet/api";

const VAULT_QUERY = gql`
  query RecoverableVaults($depositor: String!, $limit: Int!) {
    vaults(where: { depositor: $depositor }, limit: $limit) {
      items {
        id
        depositor
        depositorBtcPubKey
        vaultProvider
        applicationEntryPoint
        amount
        status
        unsignedPrePeginTx
        hashlock
        htlcVout
        offchainParamsVersion
        appVaultKeepersVersion
        universalChallengersVersion
      }
    }
  }
`;

interface IndexerVault {
  id: Hex;
  depositor: string;
  depositorBtcPubKey: string;
  vaultProvider: string;
  applicationEntryPoint: string;
  amount: string;
  status: string;
  unsignedPrePeginTx: string | null;
  hashlock: string;
  htlcVout: number;
  offchainParamsVersion: number;
  appVaultKeepersVersion: number;
  universalChallengersVersion: number;
}

function stripHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

/**
 * Call a method on the wallet's injected provider, auto-approving whatever
 * popup it raises. The one thing in this action that must happen in the
 * browser: every conformant `deriveContextHash` lives in an extension, and the
 * mock wallets are deliberately not spec-faithful.
 */
async function callProvider(
  ctx: ActionContext,
  providerPath: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const call = ctx.page.evaluate(
    async ({ providerPath, method, args }) => {
      let provider: unknown = window;
      for (const key of providerPath.split(".")) {
        provider =
          provider == null
            ? provider
            : (provider as Record<string, unknown>)[key];
      }
      if (provider == null)
        throw new Error(`provider not found at window.${providerPath}`);
      const p = provider as Record<
        string,
        (...a: unknown[]) => Promise<unknown>
      >;
      if (method === "__connect") {
        if (typeof p.requestAccounts === "function")
          return await p.requestAccounts();
        if (typeof p.connect === "function") return await p.connect();
        throw new Error(
          "provider exposes neither requestAccounts() nor connect()",
        );
      }
      if (typeof p[method] !== "function")
        throw new Error(`provider has no method ${method}`);
      return await p[method](...args);
    },
    { providerPath, method, args },
  );

  let done = false;
  // A sweep failure is why an approval never lands, so discarding it leaves the
  // run to die at the timeout with no cause recorded. Reported once per call:
  // the loop ticks ~2.5×/s, and a persistent fault would otherwise bury the log.
  let sweepFailureReported = false;
  const sweeper = (async () => {
    while (!done) {
      await ctx.page.waitForTimeout(400);
      await sweepApprovals(ctx.context, ctx.page, ctx.log).catch((err) => {
        if (sweepFailureReported) return;
        sweepFailureReported = true;
        ctx.log(
          `  approval sweep failed during ${method} (continuing): ${String(err)}`,
        );
      });
    }
  })();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(`${method} timed out after ${WALLET_CALL_TIMEOUT_MS}ms`),
        ),
      WALLET_CALL_TIMEOUT_MS,
    ),
  );
  try {
    return await Promise.race([call, timeout]);
  } finally {
    done = true;
    await sweeper;
  }
}

/** Σin − Σout for the funded Pre-PegIn, priced from the funding UTXOs. */
async function computePrepeginFee(
  fundedTxHex: string,
  btcApi: string,
  log: (m: string) => void,
): Promise<bigint> {
  const { Transaction } = await import("bitcoinjs-lib");
  const tx = Transaction.fromHex(stripHex(fundedTxHex));
  const totalOut = tx.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);

  let totalIn = 0n;
  for (const input of tx.ins) {
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const res = await fetch(`${btcApi}/tx/${txid}`, {
      signal: AbortSignal.timeout(ESPLORA_TIMEOUT_MS),
    });
    if (!res.ok)
      throw new Error(
        `Esplora ${res.status} pricing input ${txid}:${input.index}`,
      );
    const prev = (await res.json()) as { vout: { value: number }[] };
    const prevOut = prev.vout[input.index];
    // Without this, a short vout array yields BigInt(undefined) — a TypeError
    // that says nothing about the transaction that actually went missing.
    if (prevOut === undefined)
      throw new Error(
        `Esplora returned no vout ${input.index} for input tx ${txid}.`,
      );
    totalIn += BigInt(prevOut.value);
  }
  const fee = totalIn - totalOut;
  log(`  Pre-PegIn fee: Σin ${totalIn} − Σout ${totalOut} = ${fee} sat`);
  if (fee <= 0n)
    throw new Error(
      `Computed a non-positive Pre-PegIn fee (${fee}); inputs mispriced.`,
    );
  return fee;
}

export const recoverAction: Action = {
  id: "recover",
  async run(ctx: ActionContext): Promise<void> {
    const { log, config } = ctx;
    const providerPath = PROVIDER_PATH[ctx.btc.id];
    if (!providerPath)
      throw new Error(
        `recover: no injected-provider path known for BTC wallet "${ctx.btc.id}" (need unisat or okx).`,
      );

    const { registry, graphqlEndpoint, ethRpcUrl } = resolveNetworkContracts(
      config.network,
    );
    const btcApi = process.env.NEXT_PUBLIC_MEMPOOL_API ?? DEFAULT_BTC_API;
    const btcNetwork = BTC_NETWORK[config.network];

    installPopupApprover(ctx.context, log);

    // ---- Pick a vault to rehearse against, and keep its row as the reference.
    const gqlClient = createGraphQLClient(graphqlEndpoint);
    const { vaults } = await gqlClient.request<{
      vaults: { items: IndexerVault[] };
    }>(VAULT_QUERY, { depositor: ctx.eth.address.toLowerCase(), limit: 50 });

    // Two preferences, in order. A batched Pre-PegIn first, because the
    // sibling path is the riskier code — the reconstruction has to rebuild
    // EVERY HTLC output and the refund path's anchor check is fail-closed, so
    // a single-vault run leaves both untested. Then a deposit whose HTLC is
    // still unspent, which makes the refund a real one rather than a rehearsal
    // against an output that is already gone.
    const REFUNDABLE_FIRST = ["expired", "pending", "verified", "available"];
    const statusRank = (v: IndexerVault) => {
      const i = REFUNDABLE_FIRST.indexOf(v.status);
      return i === -1 ? REFUNDABLE_FIRST.length : i;
    };

    const withTx = vaults.items.filter((v) => v.unsignedPrePeginTx);
    if (withTx.length === 0)
      throw new Error(
        `recover: no vault with a Pre-PegIn transaction found for ${ctx.eth.address}. ` +
          `Do a peg-in with this wallet first, or connect the wallet that made one.`,
      );

    // Siblings share one Pre-PegIn transaction; each has its own vault id.
    const byPrePegin = new Map<string, IndexerVault[]>();
    for (const v of withTx) {
      const key = v.unsignedPrePeginTx as string;
      byPrePegin.set(key, [...(byPrePegin.get(key) ?? []), v]);
    }
    // `--txid` pins the deposit, which is how a real recovery starts: from a
    // Pre-PegIn hash the depositor supplies. Without it, pick by preference.
    const wanted = config.recoverTxid?.trim().replace(/^0x/i, "").toLowerCase();
    const allGroups = [...byPrePegin.values()];
    const targeted = wanted
      ? allGroups.filter(
          (g) =>
            stripHex(
              calculateBtcTxHash(g[0].unsignedPrePeginTx as string),
            ).toLowerCase() === wanted,
        )
      : allGroups;
    if (wanted && targeted.length === 0)
      throw new Error(
        `recover: no deposit of ${ctx.eth.address} has Pre-PegIn txid ${wanted}. ` +
          `Available: ${allGroups
            .map((g) =>
              stripHex(calculateBtcTxHash(g[0].unsignedPrePeginTx as string)),
            )
            .join(", ")}`,
      );

    const groups = [...targeted].sort((a, b) => {
      if (a.length !== b.length) return b.length - a.length;
      return Math.min(...a.map(statusRank)) - Math.min(...b.map(statusRank));
    });
    const group = groups[0];
    const usable = [...group].sort((a, b) => statusRank(a) - statusRank(b));
    const target = usable[0];
    log(
      `Rehearsing against vault ${target.id} (status=${target.status}, htlcVout=${target.htlcVout}).`,
    );
    log(
      group.length > 1
        ? `  Multi-vault Pre-PegIn: ${group.length} siblings — the sibling path is exercised.`
        : `  Single-vault Pre-PegIn: the sibling path is NOT exercised by this run.`,
    );
    // Coverage is ranked above spendability on purpose — nothing is broadcast,
    // and a withdrawn deposit still proves derivation, verification, signing and
    // the sighash check. Said out loud so it is never a silent surprise, because
    // this same transaction could NOT be broadcast.
    if (statusRank(target) >= REFUNDABLE_FIRST.length)
      log(
        `  NOTE: status "${target.status}" — this HTLC output is already spent. ` +
          `Fine for a rehearsal, but this refund could not be broadcast. Pass ` +
          `--txid=<prePeginTxid> to target a refundable deposit instead.`,
      );
    log(
      `  GROUND TRUTH (not fed into the reconstruction): hashlock=${target.hashlock}, amount=${target.amount}`,
    );

    const fundedPrePeginTxHex = target.unsignedPrePeginTx as string;

    // ---- The blind half. Depositor pubkey from the WALLET, not the row.
    await callProvider(ctx, providerPath, "__connect", []);
    const walletPubkey = String(
      await callProvider(ctx, providerPath, "getPublicKey", []),
    );
    log(`  Wallet pubkey: ${walletPubkey}`);
    // Compare in the same form: wallets return the 33-byte compressed key, the
    // row stores x-only. Comparing raw would flag every healthy run, and
    // slicing the last 64 chars would take the Y coordinate of an uncompressed
    // key rather than the X.
    const walletXOnly = processPublicKeyToXOnly(walletPubkey);
    if (walletXOnly !== stripHex(target.depositorBtcPubKey).toLowerCase())
      log(
        `  NOTE: the connected wallet's key (${walletXOnly}) is not the row's ` +
          `depositorBtcPubKey (${stripHex(target.depositorBtcPubKey)}). Derivation ` +
          `will fail below — the root is bound to the account and network, not ` +
          `just the seed.`,
      );

    const wallet = {
      deriveContextHash: async (appName: string, context: string) =>
        String(
          await callProvider(ctx, providerPath, "deriveContextHash", [
            appName,
            context,
          ]),
        ),
    };

    log("Deriving hashlocks from the wallet + the Pre-PegIn transaction…");
    const derived = await deriveHashlocksFromPrePegin({
      wallet,
      depositorBtcPubkey: walletPubkey,
      fundedPrePeginTxHex,
    });
    log(
      `  vaultCount=${derived.vaultCount}, authAnchorHash=${derived.authAnchorHash}`,
    );

    // The moment the whole design turns on: a live wallet's derivation has to
    // reproduce the hashlock this vault actually committed to on-chain.
    const derivedHashlock = derived.hashlocks[target.htlcVout];
    const onChainHashlock = stripHex(target.hashlock).toLowerCase();
    if (derivedHashlock !== onChainHashlock)
      throw new Error(
        `Derived hashlock does not match the vault's on-chain hashlock.\n` +
          `  derived:  ${derivedHashlock}\n  on-chain: ${onChainHashlock}\n` +
          `The wallet, account or network differs from the one that made this deposit.`,
      );
    log(
      `  ✔ derived hashlock MATCHES the on-chain hashlock — the key fits the lock.`,
    );

    // ---- Parameters. Supplied from the stamped versions rather than searched;
    // the enumeration fallback is unit-tested and is not the unknown here.
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(ethRpcUrl),
    });
    const addresses = await resolveProtocolAddresses(publicClient, registry);
    const protocolReader = new ViemProtocolParamsReader(
      publicClient,
      addresses.protocolParams,
    );
    const keeperReader = new ViemVaultKeeperReader(
      publicClient,
      addresses.applicationRegistry,
    );
    const challengerReader = new ViemUniversalChallengerReader(
      publicClient,
      addresses.protocolParams,
    );
    const operationKeyReader = new ViemOperationKeyReader(publicClient, {
      btcVaultRegistry: registry,
      applicationRegistry: addresses.applicationRegistry,
      protocolParams: addresses.protocolParams,
    });
    const registryReader = new ViemVaultRegistryReader(publicClient, registry);

    const [offchain, timelockPegin, keepers, challengers, vpGenesisKey] =
      await Promise.all([
        protocolReader.getOffchainParamsByVersion(target.offchainParamsVersion),
        protocolReader.getTimelockPeginByVersion(target.offchainParamsVersion),
        keeperReader.getVaultKeepersByVersion(
          target.applicationEntryPoint as Address,
          target.appVaultKeepersVersion,
        ),
        challengerReader.getUniversalChallengersByVersion(
          target.universalChallengersVersion,
        ),
        registryReader.getVaultProviderGenesisBtcPubKey(
          target.vaultProvider as Address,
        ),
      ]);

    // RFC-006: scripts are built from operation keys, not registration keys.
    // A rehearsal on a current vault can use the participants' current keys;
    // a real incident reads the epochs at the reorg height instead.
    const participantKeys = await resolveCurrentParticipantKeys({
      operationKeyReader,
      query: {
        vaultProviderEthAddress: target.vaultProvider as Address,
        vaultProviderGenesisBtcPubkey: `0x${vpGenesisKey}` as Hex,
        applicationEntryPoint: target.applicationEntryPoint as Address,
        vaultKeepers: keepers,
        universalChallengers: challengers,
      },
    });

    const candidates = buildPeginParamsCandidates({
      vaultCoreVersion: (await registryReader.getVaultData(target.id)).protocol
        .vaultCoreVersion,
      offchainParams: [
        {
          version: target.offchainParamsVersion,
          protocolFeeRate: offchain.feeRate,
          minPeginFeeRate: offchain.minPeginFeeRate,
          councilQuorum: offchain.councilQuorum,
          councilSize: offchain.securityCouncilKeys.length,
          timelockPegin,
          timelockAssert: Number(offchain.timelockAssert),
          timelockRefund: offchain.tRefund,
        },
      ],
      participantKeySets: [
        {
          vaultProvider: target.vaultProvider as Address,
          vaultProviderBtcPubkey: participantKeys.vaultProvider
            .operationBtcPubkey as string,
          appVaultKeepersVersion: target.appVaultKeepersVersion,
          vaultKeeperBtcPubkeys: participantKeys.vaultKeeperOperationKeysSorted,
          universalChallengersVersion: target.universalChallengersVersion,
          universalChallengerBtcPubkeys:
            participantKeys.universalChallengerOperationKeysSorted,
        },
      ],
    });

    const prepeginMaxFee = await computePrepeginFee(
      fundedPrePeginTxHex,
      btcApi,
      log,
    );

    log("Verifying the parameter set against the funded transaction…");
    const result = await reconstructPeginParams({
      hashlocks: derived.hashlocks,
      fundedPrePeginTxHex,
      depositorBtcPubkey: walletPubkey,
      prepeginMaxFee,
      maxAcceptableCommissionBps: REHEARSAL_MAX_COMMISSION_BPS,
      network: btcNetwork,
      candidates,
      unresolvedVersions: [],
    });
    log(
      `  ✔ verified: ${result.candidatesTried} candidate(s) tried, terms projected.`,
    );

    // ---- The differential: what we recovered blind vs what the row says.
    const recoveredAmount = result.peginAmounts[target.htlcVout];
    const onChainAmount = BigInt(target.amount);
    log(`  amount: recovered=${recoveredAmount} on-chain=${onChainAmount}`);
    if (recoveredAmount !== onChainAmount)
      throw new Error(
        `Recovered peg-in amount ${recoveredAmount} does not match the on-chain ` +
          `amount ${onChainAmount}. The inversion or the reserve is wrong.`,
      );
    log("  ✔ recovered peg-in amount MATCHES the on-chain amount.");

    // ---- The refund, built from recovered inputs. Never broadcast.
    const { vault, context } = toRefundInputs(result, {
      htlcVout: target.htlcVout,
      depositorBtcPubkey: walletPubkey,
      applicationEntryPoint: target.applicationEntryPoint as Address,
      fundedPrePeginTxHex,
      hashlocks: derived.hashlocks,
      network: btcNetwork,
    });

    // Run the REAL refund orchestrator, not a hand-rolled build. It signs with
    // the wallet under the taproot script-path options (CLAUDE.md critical
    // path 8, where wallet support is inconsistent and failures are silent),
    // then verifies the returned Schnorr signature against a sighash it
    // recomputes from the PSBT it built — so a wallet that returns a
    // plausible-but-wrong signature is caught here rather than by the network.
    //
    // `broadcastTx` is injected, so the whole path runs and stops at the door.
    let signedTxHex: string | undefined;
    const wouldBroadcast = await buildAndBroadcastRefund({
      vaultId: target.id,
      readVault: async () => vault,
      readPrePeginContext: async () => context,
      feeRate: REFUND_FEE_RATE_SAT_VB,
      signPsbt: async (psbtHex, options) => {
        log(
          `  Signing the refund PSBT with ${ctx.btc.id} (approve in the wallet)…`,
        );
        return String(
          await callProvider(ctx, providerPath, "signPsbt", [psbtHex, options]),
        );
      },
      broadcastTx: async (txHex) => {
        signedTxHex = txHex;
        // The txid it WOULD have had. Computed, not invented, and never sent.
        return { txId: stripHex(calculateBtcTxHash(txHex)) };
      },
    });

    if (!signedTxHex)
      throw new Error("recover: the refund never reached the broadcast seam.");
    log(
      `  ✔ refund signed and signature verified against a recomputed sighash.`,
    );
    log(`  ✔ would-be refund txid: ${wouldBroadcast.txId} (NOT broadcast)`);
    log(`  signed tx: ${signedTxHex.length / 2} bytes`);

    log("");
    log("Rehearsal complete. Recovered blind from wallet + transaction:");
    log(`  hashlock  ${derivedHashlock}  (matches chain)`);
    log(`  amount    ${recoveredAmount}  (matches chain)`);
    log(`  refund    signed + signature-verified, NOT broadcast`);
    log("");
    log(
      "Not exercised here, by design: the parameter enumeration fallback (unit-tested), " +
        "and reading the stamps at a historical block height, which a real incident needs.",
    );
  },
};
