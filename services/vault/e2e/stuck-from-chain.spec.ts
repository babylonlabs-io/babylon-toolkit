/**
 * A stuck vault's exit is offered from the chain and Bitcoin, whatever the indexer
 * says about the vault.
 *
 * The vault is stuck when the registry still reports it Verified and its PegIn is
 * a valid spend of the HTLC. Activate-and-redeem is then the only exit, and the
 * contract refuses it after the activation deadline, so an indexer that leaves the
 * row out or gets a field wrong must not be able to hide it until then.
 *
 * The recorded backend serves the app's reads, but the recording ends before any
 * deposit exists, so this spec states the premise of each case: the indexer's row,
 * the registry's record and what Bitcoin serves. The real hooks, polling and pages
 * run on top of them. The Bitcoin side is a real signet PegIn, so the real verifier
 * accepts or refuses it. Nothing here signs.
 */

import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core/contracts";
import { expect, test, type Page, type Route } from "@playwright/test";
import { Transaction } from "bitcoinjs-lib";
import {
  encodeFunctionResult,
  parseAbi,
  toFunctionSelector,
  toHex,
  type Hex,
} from "viem";

import {
  SIGNET_HASHLOCK,
  SIGNET_HTLC_VOUT,
  SIGNET_PEGIN_TXID,
  SIGNET_PEGIN_TX_HEX,
  SIGNET_PRE_PEGIN_TXID,
  SIGNET_PRE_PEGIN_TX_HEX,
} from "../src/clients/btc/__tests__/signetPegin.fixture";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import {
  RECORDED_DEPLOYMENT,
  RECORDED_DEPOSITOR,
  RECORDED_ENDPOINTS,
} from "./fixtures/replay/contracts";
import { blockOffsiteRequests, recordedPageWallets } from "./visual/capture";

/** `IBTCVaultRegistry.BTCVaultStatus.Verified`, spelled out rather than imported. */
const ON_CHAIN_VERIFIED = 1;

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;
/** A second vault, whose PegIn the proof refuses while the first one's passes. */
const FORGED_VAULT_ID = `0x${"22".repeat(32)}` as Hex;
const FORGED_VOUT = 1;
const VAULT_PROVIDER = "0x00000000000000000000000000000000000000a1";
/** The injected wallet's x-only key, so the vault belongs to the connected wallet. */
const DEPOSITOR_BTC_PUBKEY =
  `0x${RECORDED_DEPOSITOR.BTC_PUBLIC_KEY.slice(2)}` as Hex;
const AMOUNT_SATS = 1_000_000n;
/** `AMOUNT_SATS` as a vault's row shows it, in any of the page's lists. */
const AMOUNT_LABEL = "0.01 sBTC";

const CHAIN_HEAD = 50_000_000n;
/** Registered just now, so no recorded timeout has elapsed. */
const CREATED_JUST_NOW = CHAIN_HEAD - 3n;
const VERIFIED_JUST_NOW = CHAIN_HEAD - 3n;

/** `COPY.pegin.labels.ACTIVATION_INCOMPLETE`. */
const STUCK_LABEL = "Activation incomplete";
/** `COPY.vaults.actions.withdraw`. */
const WITHDRAW_LABEL = "Withdraw";
/** `COPY.deposit.emergencyWithdraw.confirmButton`. */
const CONFIRM_WITHDRAW_LABEL = "Withdraw without activating";
/** The head of `COPY.deposit.errors.invalidSecret`: the derivation ran to completion. */
const INVALID_SECRET_MESSAGE = "Invalid secret: SHA256(secret) does not match";
const PENDING_ROW_TEST_ID = "pending-deposit-row";
const PARTIAL_LOAD_WARNING_TEST_ID = "vaults-partial-load-error";

const VAULT_ROW_WAIT_MS = 20_000;
/** An indexer outage is retried before the deposit list stops loading. */
const INDEXER_OUTAGE_WAIT_MS = 60_000;
/** One load of the vault list: the first try and the retries of `shouldRetry`. */
const VAULT_LIST_ATTEMPTS_PER_LOAD = 4;
/** Past the vault list's 60s poll, for a case that waits for its next load. */
const NEXT_VAULT_LIST_LOAD_WAIT_MS = 80_000;

const GET_DEPOSITOR_VAULT_IDS_ABI = parseAbi([
  "function getDepositorVaultIds(address depositor) view returns (bytes32[] vaultIds)",
]);

/** The PegIn as the depositor signed it, which the registry stores. */
const DEPOSITOR_SIGNED_PEGIN_TX = (() => {
  // In the broadcast witness the depositor's signature sits just under the
  // preimage, after 4 challenger, 4 keeper and the vault provider's signatures.
  const DEPOSITOR_SIG_INDEX = 9;
  const broadcast = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
  const signed = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
  const witness = broadcast.ins[0].witness;
  signed.setWitness(0, [
    witness[DEPOSITOR_SIG_INDEX],
    witness[witness.length - 2],
    witness[witness.length - 1],
  ]);
  return signed.toHex();
})();

/**
 * The second vault's PegIn as a lying API serves it, under the txid the registry's
 * signed PegIn gives. It spends the Pre-PegIn's OP_RETURN rather than an HTLC, which
 * gives it its own txid and outspend answer, so the proof refuses it at the output
 * its leaf must commit to. A depositor-signed witness at the real outpoint is
 * refused with the real verifier in `clients/btc/__tests__/outspend.test.ts`.
 */
const FORGED_PEGIN = (() => {
  const tx = Transaction.fromHex(DEPOSITOR_SIGNED_PEGIN_TX);
  tx.ins[0].index = FORGED_VOUT;
  return tx;
})();

/**
 * A well-formed row that is right about the vault. Each case overrides what the
 * indexer gets wrong, so a case failing names the field that hid the exit.
 */
function honestIndexerRow() {
  const hex = `0x${"33".repeat(32)}`;
  return {
    id: VAULT_ID,
    depositor: RECORDED_DEPOSITOR.ETH_ADDRESS,
    depositorBtcPubKey: DEPOSITOR_BTC_PUBKEY,
    vaultProvider: VAULT_PROVIDER,
    amount: AMOUNT_SATS.toString(),
    applicationEntryPoint: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
    status: "verified",
    inUse: false,
    ackCount: 0,
    depositorSignedPeginTx: `0x${DEPOSITOR_SIGNED_PEGIN_TX}`,
    unsignedPrePeginTx: `0x${SIGNET_PRE_PEGIN_TX_HEX}`,
    peginTxHash: `0x${SIGNET_PEGIN_TXID}`,
    hashlock: SIGNET_HASHLOCK,
    htlcVout: SIGNET_HTLC_VOUT,
    secret: null,
    peginSigsPostedAt: null,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    currentOwner: null,
    referralCode: 0,
    depositorPayoutBtcAddress: hex,
    depositorWotsPkHash: hex,
    btcPopSignature: null,
    pendingAt: "1700000000",
    verifiedAt: null,
    activatedAt: null,
    expiredAt: null,
    expirationReason: null,
    activationRedeemReason: null,
    activationFailedData: null,
    blockNumber: "1",
  };
}

interface Premise {
  /** The indexer's vault list: its rows, or an outage of that query. */
  indexer: { rows: readonly object[] } | "down";
  /** Whether the registry also lists the vault whose PegIn fails the proof. */
  withForgedVault?: boolean;
}

/** Answers the indexer's vault list; returns how many times it was asked. */
async function stateIndexer(
  page: Page,
  { indexer }: Pick<Premise, "indexer">,
): Promise<{ vaultListRequests: () => number }> {
  let vaultListRequests = 0;
  const origin = new URL(RECORDED_ENDPOINTS.GRAPHQL_ENDPOINT).origin;
  await page.route(
    (url) => url.origin === origin,
    async (route: Route) => {
      const query = route.request().postDataJSON()?.query as string | undefined;
      if (!query?.includes("GetVaultsByDepositorFirstPage")) {
        return route.fallback();
      }
      vaultListRequests += 1;
      if (indexer === "down") return route.fulfill({ status: 500, body: "" });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            vaults: {
              items: indexer.rows,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      });
    },
  );
  return { vaultListRequests: () => vaultListRequests };
}

/** Answers each HTLC's spend and the transactions; counts the forged PegIn's fetches. */
async function stateBitcoin(
  page: Page,
): Promise<{ forgedPeginFetches: () => number }> {
  let forgedPeginFetches = 0;
  const outspendPath = /\/tx\/[0-9a-f]{64}\/outspend\/(\d+)$/;
  const hexPath = /\/tx\/([0-9a-f]{64})\/hex$/;
  await page.route(
    (url) =>
      url.pathname.startsWith("/mempool") &&
      (outspendPath.test(url.pathname) || hexPath.test(url.pathname)),
    (route: Route) => {
      const { pathname } = new URL(route.request().url());
      const outspendVout = outspendPath.exec(pathname)?.[1];
      if (outspendVout !== undefined) {
        return route.fulfill({
          json: {
            spent: true,
            txid:
              Number(outspendVout) === FORGED_VOUT
                ? FORGED_PEGIN.getId()
                : SIGNET_PEGIN_TXID,
            vin: 0,
            status: { confirmed: true },
          },
        });
      }
      const txid = hexPath.exec(pathname)?.[1];
      if (txid === SIGNET_PRE_PEGIN_TXID) {
        return route.fulfill({
          contentType: "text/plain",
          body: SIGNET_PRE_PEGIN_TX_HEX,
        });
      }
      if (txid === SIGNET_PEGIN_TXID) {
        return route.fulfill({
          contentType: "text/plain",
          body: SIGNET_PEGIN_TX_HEX,
        });
      }
      if (txid !== FORGED_PEGIN.getId()) return route.fulfill({ status: 404 });
      forgedPeginFetches += 1;
      return route.fulfill({
        contentType: "text/plain",
        body: FORGED_PEGIN.toHex(),
      });
    },
  );
  return { forgedPeginFetches: () => forgedPeginFetches };
}

async function openVaults(
  page: Page,
  premise: Premise,
): Promise<{
  forgedPeginFetches: () => number;
  vaultListRequests: () => number;
}> {
  await blockOffsiteRequests(page);
  await installRecordedBackend(page, {
    statedMethods: { eth_blockNumber: toHex(CHAIN_HEAD) },
    statedAnswers: [
      {
        target: RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY,
        selector: toFunctionSelector(GET_DEPOSITOR_VAULT_IDS_ABI[0]),
        answer: () =>
          encodeFunctionResult({
            abi: GET_DEPOSITOR_VAULT_IDS_ABI,
            functionName: "getDepositorVaultIds",
            result: premise.withForgedVault
              ? [FORGED_VAULT_ID, VAULT_ID]
              : [VAULT_ID],
          }),
      },
      {
        target: RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY,
        selector: toFunctionSelector("function getBtcVaultBasicInfo(bytes32)"),
        answer: () =>
          encodeFunctionResult({
            abi: BTCVaultRegistryABI,
            functionName: "getBtcVaultBasicInfo",
            result: {
              depositor: RECORDED_DEPOSITOR.ETH_ADDRESS,
              depositorBtcPubKey: DEPOSITOR_BTC_PUBKEY,
              amount: AMOUNT_SATS,
              vaultProvider: VAULT_PROVIDER,
              status: ON_CHAIN_VERIFIED,
              applicationEntryPoint: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
              createdAt: CREATED_JUST_NOW,
            },
          }),
      },
      {
        target: RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY,
        selector: toFunctionSelector(
          "function getBtcVaultProtocolInfo(bytes32)",
        ),
        answer: (callData) =>
          encodeFunctionResult({
            abi: BTCVaultRegistryABI,
            functionName: "getBtcVaultProtocolInfo",
            result: {
              depositorSignedPeginTx: callData.includes(
                FORGED_VAULT_ID.slice("0x".length),
              )
                ? `0x${FORGED_PEGIN.toHex()}`
                : `0x${DEPOSITOR_SIGNED_PEGIN_TX}`,
              universalChallengersVersion: 1,
              appVaultKeepersVersion: 1,
              offchainParamsVersion: 1,
              verifiedAt: VERIFIED_JUST_NOW,
              depositorWotsPkHash: `0x${"33".repeat(32)}`,
              hashlock: SIGNET_HASHLOCK as Hex,
              htlcVout: callData.includes(FORGED_VAULT_ID.slice("0x".length))
                ? FORGED_VOUT
                : SIGNET_HTLC_VOUT,
              depositorPopSignature: "0x",
              prePeginTxHash: `0x${SIGNET_PRE_PEGIN_TXID}`,
              vaultProviderCommissionBps: 100,
              claimExpiredUntil: 0n,
              vaultCoreVersion: 1,
            },
          }),
      },
    ],
  });
  const { vaultListRequests } = await stateIndexer(page, premise);
  const { forgedPeginFetches } = await stateBitcoin(page);
  await injectPageWallets(page, recordedPageWallets());
  await page.goto("/vaults", { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  return { forgedPeginFetches, vaultListRequests };
}

async function expectExitOffered(page: Page, timeout = VAULT_ROW_WAIT_MS) {
  const row = page.getByTestId(PENDING_ROW_TEST_ID);
  await expect(row.getByText(STUCK_LABEL).first()).toBeVisible({ timeout });
  await expect(row.getByRole("button", { name: WITHDRAW_LABEL })).toBeEnabled();
}

const WRONG_HEX = `0x${"99".repeat(32)}`;

/** A well-formed Bitcoin transaction that is not this vault's Pre-PegIn. */
const OTHER_PRE_PEGIN_TX = `0x${[
  "02000000", // version
  "01", // input count
  "44".repeat(32), // previous txid
  "00000000", // previous vout
  "00", // empty scriptSig
  "ffffffff", // sequence
  "01", // output count
  "40420f0000000000", // 1_000_000 sats, little-endian
  "00", // empty scriptPubKey
  "00000000", // locktime
].join("")}`;

test.describe("a stuck vault's exit comes from chain state", () => {
  const lies: readonly (readonly [string, object])[] = [
    ["a false Pending status", { status: "pending" }],
    ["a false Active status", { status: "available" }],
    ["a false Redeemed status", { status: "redeemed" }],
    ["another depositor's key", { depositorBtcPubKey: WRONG_HEX }],
    ["a wrong HTLC vout", { htlcVout: 7 }],
    ["a wrong PegIn hash", { peginTxHash: WRONG_HEX }],
    ["another Pre-PegIn's bytes", { unsignedPrePeginTx: OTHER_PRE_PEGIN_TX }],
  ];

  test("offers the exit for a vault the indexer leaves out", async ({
    page,
  }) => {
    await openVaults(page, { indexer: { rows: [] } });

    await expectExitOffered(page);
  });

  for (const [name, lie] of lies) {
    test(`offers the exit for a vault whose indexed row has ${name}`, async ({
      page,
    }) => {
      await openVaults(page, {
        indexer: { rows: [{ ...honestIndexerRow(), ...lie }] },
      });

      await expectExitOffered(page);
      // One row: the chain's replaced the indexer's rather than joining it. Counted
      // across the page, because a leftover Redeemed row renders under Inactive
      // Vaults, outside the pending list.
      await expect(page.getByText(AMOUNT_LABEL)).toHaveCount(1);
    });
  }

  test("offers the exit when the indexer's list is down on a cold load", async ({
    page,
  }) => {
    await openVaults(page, { indexer: "down" });

    await expectExitOffered(page, INDEXER_OUTAGE_WAIT_MS);
  });

  test("keeps the exit and its open modal through the next load of a failing vault list", async ({
    page,
  }) => {
    test.slow();
    const { vaultListRequests } = await openVaults(page, { indexer: "down" });
    await expectExitOffered(page, INDEXER_OUTAGE_WAIT_MS);

    const row = page.getByTestId(PENDING_ROW_TEST_ID);
    await row.getByRole("button", { name: WITHDRAW_LABEL }).click();
    const confirm = page
      .locator(".portal-root")
      .getByRole("button", { name: CONFIRM_WITHDRAW_LABEL, exact: true });
    await expect(confirm).toBeVisible();

    // With nothing cached, this load resets the list to loading before it asks.
    await expect
      .poll(vaultListRequests, { timeout: NEXT_VAULT_LIST_LOAD_WAIT_MS })
      .toBeGreaterThan(VAULT_LIST_ATTEMPTS_PER_LOAD);
    await expect(confirm).toBeVisible();
    await expect(row.getByText(STUCK_LABEL).first()).toBeVisible();
    // The missing list is not silent while the exit stays up.
    await expect(page.getByTestId(PARTIAL_LOAD_WARNING_TEST_ID)).toBeVisible();
  });

  test("takes the exit through to the secret on bytes the indexer never served", async ({
    page,
  }) => {
    await openVaults(page, {
      indexer: { rows: [{ ...honestIndexerRow(), unsignedPrePeginTx: "" }] },
    });
    await expectExitOffered(page);

    await page
      .getByTestId(PENDING_ROW_TEST_ID)
      .getByRole("button", { name: WITHDRAW_LABEL })
      .click();
    const dialog = page.locator(".portal-root");
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: CONFIRM_WITHDRAW_LABEL, exact: true })
      .click();

    // The stub wallet derives a secret that is not the signet vault's, and the
    // app says so before any write. Reaching this message proves the Pre-PegIn
    // bytes passed the on-chain hash check, the wallet was asked to derive and
    // the confirm's own proof of the PegIn passed.
    await expect(dialog.getByText(INVALID_SECRET_MESSAGE)).toBeVisible();
  });

  test("adds no row for an omitted vault whose PegIn the proof refuses", async ({
    page,
  }) => {
    const { forgedPeginFetches } = await openVaults(page, {
      indexer: { rows: [] },
      withForgedVault: true,
    });

    // The proven vault's row is built from the same read that refused the forged
    // one, so it appearing proves that read has finished.
    await expectExitOffered(page);
    expect(forgedPeginFetches()).toBeGreaterThan(0);
    await expect(page.getByTestId(PENDING_ROW_TEST_ID)).toHaveCount(1);
  });

  test("keeps a healthy indexed vault out of the stuck state when the proof refuses its PegIn", async ({
    page,
  }) => {
    const { forgedPeginFetches } = await openVaults(page, {
      indexer: {
        rows: [
          {
            ...honestIndexerRow(),
            id: FORGED_VAULT_ID,
            depositorSignedPeginTx: `0x${FORGED_PEGIN.toHex()}`,
            peginTxHash: `0x${FORGED_PEGIN.getId()}`,
            htlcVout: FORGED_VOUT,
          },
        ],
      },
      withForgedVault: true,
    });

    await expectExitOffered(page);
    expect(forgedPeginFetches()).toBeGreaterThan(0);
    const rows = page.getByTestId(PENDING_ROW_TEST_ID);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: STUCK_LABEL })).toHaveCount(1);
  });
});
