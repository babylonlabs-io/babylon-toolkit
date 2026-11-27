/**
 * A repay is reported done once the chain has buried it, not once the page
 * has re-read the position (#2826).
 *
 * The success step used to wait for the refresh a mined repay starts: the
 * vault, position and hub queries had to refetch first, retries included,
 * while the button read "Confirming..." and the dialog offered no way out. A
 * slow indexer held the depositor on the form after the chain had answered.
 *
 * The recorded backend serves the connected Loans page. The recorded
 * depositor holds no position, so this spec states one: 100 USDC owed on
 * reserve 0 against one 0.1 BTC vault, a wallet holding 1,000 USDC, and an
 * adapter already approved to take it, so no approve is sent. The indexer is
 * stated to agree with the chain.
 *
 * Nothing is signed. The injected ETH wallet forwards the repay to the
 * replayed endpoint, where `statedWrite` answers as the wallet's node would:
 * each test states how the send ends. A send the node accepts is mined and
 * buried three blocks deep at once, so the app reports it on its first look.
 *
 * The success case holds the indexer's position reads from the click on. The
 * refresh the mined repay starts waits on them, and the success step must
 * show while it does. The failure cases end before success either way: one
 * mined and reverted, one the wallet refused in a way that may still have
 * broadcast it.
 */

import {
  AaveIntegrationAdapterABI,
  AaveSpokeABI,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  erc20Abi,
  getAbiItem,
  maxUint256,
  parseAbi,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend, type ReplayBackend } from "./fixtures/replay";
import type { StatedAnswer } from "./fixtures/replay/chain";
import {
  RECORDED_DEPLOYMENT,
  RECORDED_DEPOSITOR,
  RECORDED_ENDPOINTS,
} from "./fixtures/replay/contracts";
import {
  statedWrite,
  type StatedWrite,
  type StatedWriteOutcome,
} from "./fixtures/replay/statedWrite";
import { AMOUNT_INPUT } from "./real/actions/selectors";
import {
  assertRecordingCovered,
  blockOffsiteRequests,
  recordedPageWallets,
} from "./visual/capture";

const ADAPTER_ABI = AaveIntegrationAdapterABI as Abi;
const SPOKE_ABI = AaveSpokeABI as Abi;
/** The two Hub reads behind the Loans row's liquidity column (`aaveHub.ts`). */
const HUB_LIQUIDITY_ABI = parseAbi([
  "function getAssetOwed(uint256 assetId) view returns (uint256 drawn, uint256 premium)",
  "function getAssetSwept(uint256 assetId) view returns (uint256)",
]);

/**
 * The Core Spoke: the recorded answer to the adapter's
 * `BTC_VAULT_CORE_SPOKE()`.
 */
const CORE_SPOKE: Address = "0xb2884144a43b40cb3a89042b3e94f0f1e41cd022";
/** Reserve 0's underlying in the recorded `GetAaveAppConfig`: USDC. */
const USDC: Address = "0xb588c1bd8a6cd3f114a52a0ad916778b419ecf48";
const USDC_DECIMALS = 6;
/** The reserve the debt is on: reserve 0, USDC. */
const DEBT_RESERVE_ID = 0n;
/** The vBTC collateral reserve, as the recorded config names it. */
const VBTC_RESERVE_ID = 3n;

/** The depositor's position proxy. Any address the recording does not hold. */
const POSITION_PROXY: Address = `0x${"0b".repeat(20)}`;
/** The one vault behind the position. */
const VAULT_ID: Hex = `0x${"0a".repeat(32)}`;
/** 0.1 BTC of collateral, in satoshis. */
const COLLATERAL_SATS = 10_000_000n;
/** 100 USDC owed, in USDC base units. */
const DEBT_USDC_RAW = 100_000_000n;
/** 1,000 USDC in the wallet: more than the debt, so no shortfall warning. */
const WALLET_USDC_RAW = 1_000_000_000n;

/**
 * The spoke's account data. Values in USD use 1e26 = $1 and debt values 1e53
 * = $1 (the SDK's `AAVE_BASE_CURRENCY_DECIMALS`,
 * `AAVE_BASE_CURRENCY_RAY_DECIMALS`); factors are WAD. $5,000 of collateral
 * at the recorded 75% collateral factor against $100 owed is a health factor
 * of 37.5. `borrowCount` must match the reserves stated with debt, or the
 * position read refuses the reserve list as incomplete.
 */
const ACCOUNT_DATA = {
  riskPremium: 0n,
  avgCollateralFactor: 75n * 10n ** 16n,
  healthFactor: 375n * 10n ** 17n,
  totalCollateralValue: 5_000n * 10n ** 26n,
  totalDebtValueRay: 100n * 10n ** 53n,
  activeCollateralCount: 1n,
  borrowCount: 1n,
};

/**
 * The position's stored dynamic config key. Key 0 under the vBTC reserve is
 * the one config the recording holds, so the split-params reads it serves
 * stand for both the form and the pre-sign check.
 */
const DYNAMIC_CONFIG_KEY = 0;

/** The indexer's timestamp for the position and its collateral row. */
const INDEXED_AT = "1760000000";

/** The amount typed into the form, and the base units it signs. */
const REPAY_AMOUNT_TYPED = "25";
const REPAY_AMOUNT_RAW = 25_000_000n;

/**
 * Long enough for the lazily loaded loan-flow chunk, which a cold dev server
 * compiles on first open.
 */
const FORM_READY_TIMEOUT_MS = 20_000;

/** The connected Loans page reaches all four boundaries. */
const ALL_BOUNDARIES = ["eth-rpc", "graphql", "vp-health", "mempool"] as const;

/** `COPY.loans.repaySuccess.title`. */
const REPAY_SUCCESSFUL = "Repay successful";
/** `COPY.common.transactionFailedTitle`. */
const TRANSACTION_FAILED = "Transaction failed";
/** `CONTRACT_ERROR_MESSAGES.ReservePaused`. */
const RESERVE_PAUSED =
  "This market is on hold, so it can't be used right now. Try again later.";
/** `COPY.common.classifiedErrors.sendOutcomeUnknown`. */
const SEND_OUTCOME_UNKNOWN =
  "Your wallet reported an error, but this transaction may still have gone through. Check a block explorer before trying again.";
/** `COPY.loans.repay.action`. */
const REPAY_LABEL = "Repay";
/** `COPY.loans.repay.enterAmount`. */
const ENTER_AMOUNT_LABEL = "Enter an amount";
/** `COPY.common.close`, the dialog's close control. */
const CLOSE_LABEL = "Close";

function selector(abi: Abi, name: string): Hex {
  return toFunctionSelector(getAbiItem({ abi, name }) as AbiFunction);
}

/** The chain's side of the premise: the debt, the wallet and the allowance. */
function owedUsdcPosition(): StatedAnswer[] {
  return [
    {
      target: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
      selector: selector(ADAPTER_ABI, "getPosition"),
      answer: () =>
        encodeFunctionResult({
          abi: ADAPTER_ABI,
          functionName: "getPosition",
          result: {
            vaultIds: [VAULT_ID],
            totalCollateralBTC: COLLATERAL_SATS,
            proxyContract: POSITION_PROXY,
          },
        }),
    },
    {
      // The overlay shows the interest fee; none keeps the figures plain.
      target: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
      selector: selector(ADAPTER_ABI, "interestFeeBps"),
      answer: () =>
        encodeFunctionResult({
          abi: ADAPTER_ABI,
          functionName: "interestFeeBps",
          result: 0n,
        }),
    },
    {
      // Asked for the vBTC reserve and for every borrowable one.
      target: CORE_SPOKE,
      selector: selector(SPOKE_ABI, "getUserPosition"),
      answer: (callData) => {
        const [reserveId] = decodeFunctionData({
          abi: SPOKE_ABI,
          data: callData,
        }).args as [bigint, Address];
        return encodeFunctionResult({
          abi: SPOKE_ABI,
          functionName: "getUserPosition",
          result: {
            drawnShares: reserveId === DEBT_RESERVE_ID ? DEBT_USDC_RAW : 0n,
            premiumShares: 0n,
            premiumOffsetRay: 0n,
            suppliedShares:
              reserveId === VBTC_RESERVE_ID ? COLLATERAL_SATS : 0n,
            dynamicConfigKey: DYNAMIC_CONFIG_KEY,
          },
        });
      },
    },
    {
      target: CORE_SPOKE,
      selector: selector(SPOKE_ABI, "getUserAccountData"),
      answer: () =>
        encodeFunctionResult({
          abi: SPOKE_ABI,
          functionName: "getUserAccountData",
          result: ACCOUNT_DATA,
        }),
    },
    {
      // Only the reserve with debt is asked.
      target: CORE_SPOKE,
      selector: selector(SPOKE_ABI, "getUserTotalDebt"),
      answer: () =>
        encodeFunctionResult({
          abi: SPOKE_ABI,
          functionName: "getUserTotalDebt",
          result: DEBT_USDC_RAW,
        }),
    },
    {
      target: USDC,
      selector: selector(erc20Abi, "balanceOf"),
      answer: () =>
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "balanceOf",
          result: WALLET_USDC_RAW,
        }),
    },
    {
      target: USDC,
      selector: selector(erc20Abi, "decimals"),
      answer: () =>
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "decimals",
          result: USDC_DECIMALS,
        }),
    },
    {
      // Already approved, so the repay is the only transaction.
      target: USDC,
      selector: selector(erc20Abi, "allowance"),
      answer: () =>
        encodeFunctionResult({
          abi: erc20Abi,
          functionName: "allowance",
          result: maxUint256,
        }),
    },
    {
      target: RECORDED_DEPLOYMENT.AAVE_HUB,
      selector: selector(HUB_LIQUIDITY_ABI, "getAssetOwed"),
      answer: () =>
        encodeFunctionResult({
          abi: HUB_LIQUIDITY_ABI,
          functionName: "getAssetOwed",
          result: [DEBT_USDC_RAW, 0n],
        }),
    },
    {
      target: RECORDED_DEPLOYMENT.AAVE_HUB,
      selector: selector(HUB_LIQUIDITY_ABI, "getAssetSwept"),
      answer: () =>
        encodeFunctionResult({
          abi: HUB_LIQUIDITY_ABI,
          functionName: "getAssetSwept",
          result: 0n,
        }),
    },
  ];
}

/** The indexer's position and collateral row, agreeing with the chain. */
const INDEXED_POSITIONS = {
  data: {
    aavePositions: {
      items: [
        {
          depositorAddress: RECORDED_DEPOSITOR.ETH_ADDRESS.toLowerCase(),
          proxyContract: POSITION_PROXY,
          totalCollateral: COLLATERAL_SATS.toString(),
          createdAt: INDEXED_AT,
          updatedAt: INDEXED_AT,
        },
      ],
    },
  },
};
const INDEXED_COLLATERALS = {
  data: {
    aavePositionCollaterals: {
      items: [
        {
          depositorAddress: RECORDED_DEPOSITOR.ETH_ADDRESS.toLowerCase(),
          vaultId: VAULT_ID,
          amount: COLLATERAL_SATS.toString(),
          addedAt: INDEXED_AT,
          removedAt: null,
          liquidationIndex: "0",
          vault: null,
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

interface IndexedPosition {
  /** Hold every position read from now on, until {@link release}. */
  holdFromNow(): void;
  /** Answer the held reads, and every later one at once. */
  release(): void;
  /** How many position reads are held now. */
  heldReads(): number;
}

/**
 * Answers the indexer's two position queries; everything else falls back to
 * the replay. Registered after it, so it runs first.
 */
async function stateIndexedPosition(page: Page): Promise<IndexedPosition> {
  let hold: Promise<void> | null = null;
  let releaseHold = () => {};
  let held = 0;
  const origin = new URL(RECORDED_ENDPOINTS.GRAPHQL_ENDPOINT).origin;
  await page.route(
    (url) => url.origin === origin,
    async (route) => {
      const query = route.request().postDataJSON()?.query as string | undefined;
      const answer = query?.includes("query GetAavePositions(")
        ? INDEXED_POSITIONS
        : query?.includes("query GetAavePositionCollaterals(")
          ? INDEXED_COLLATERALS
          : null;
      if (answer === null) return route.fallback();
      if (hold !== null) {
        held += 1;
        await hold;
        held -= 1;
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(answer),
      });
    },
  );
  return {
    holdFromNow() {
      hold = new Promise((resolve) => {
        releaseHold = resolve;
      });
    },
    release() {
      hold = null;
      releaseHold();
    },
    heldReads: () => held,
  };
}

interface RepayForm {
  backend: ReplayBackend;
  write: StatedWrite;
  indexer: IndexedPosition;
  dialog: Locator;
  submit: Locator;
}

/**
 * Opens the Repay form from the Loans page, the way a depositor with one loan
 * reaches it, and types the amount to repay.
 */
async function openRepayForm(
  page: Page,
  outcome: StatedWriteOutcome,
): Promise<RepayForm> {
  await blockOffsiteRequests(page);
  const write = statedWrite({
    account: RECORDED_DEPOSITOR.ETH_ADDRESS,
    target: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
    outcome,
  });
  const backend = await installRecordedBackend(page, {
    statedAnswers: owedUsdcPosition(),
    statedWrite: write,
  });
  const indexer = await stateIndexedPosition(page);
  await injectPageWallets(page, recordedPageWallets());

  await page.goto("/loans", { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  // One loan: Repay opens its form directly, with no picker.
  await page.getByTestId("loans-repay-button").click();

  const dialog = page.locator(".portal-root");
  const amount = dialog.locator(AMOUNT_INPUT);
  await amount.waitFor({ timeout: FORM_READY_TIMEOUT_MS });
  await amount.fill(REPAY_AMOUNT_TYPED);
  const submit = dialog.getByTestId("repay-submit-button");
  await expect(submit).toHaveText(REPAY_LABEL);
  await expect(submit).toBeEnabled();
  return { backend, write, indexer, dialog, submit };
}

/** The repay the wallet was asked to send: the typed amount on reserve 0. */
function expectOneRepaySent(write: StatedWrite): void {
  expect(write.sends).toHaveLength(1);
  expect(
    decodeFunctionData({ abi: ADAPTER_ABI, data: write.sends[0] }),
  ).toEqual({
    functionName: "repayToCorePosition",
    args: [RECORDED_DEPOSITOR.ETH_ADDRESS, DEBT_RESERVE_ID, REPAY_AMOUNT_RAW],
  });
}

test("shows the repay as successful while the position refresh it started is still loading", async ({
  page,
}) => {
  const { backend, write, indexer, dialog, submit } = await openRepayForm(
    page,
    { kind: "succeeds" },
  );

  // Nothing between the click and the mined receipt reads the position, so
  // the reads held from here are the refresh the repay starts, plus at most
  // one from the position's background poll. That the repay starts the
  // refresh at all is pinned by the hook tests of its invalidated keys.
  indexer.holdFromNow();
  await submit.click();

  await expect(
    dialog.getByText(REPAY_SUCCESSFUL, { exact: true }),
  ).toBeVisible();
  // Still unanswered, so success did not wait for them.
  await expect.poll(indexer.heldReads).toBeGreaterThan(0);
  expectOneRepaySent(write);

  indexer.release();
  await dialog.getByTestId("loan-success-done-button").click();
  await expect(page).toHaveURL(/\/loans$/);
  await expect(page.getByTestId("loan-success-done-button")).toHaveCount(0);

  assertRecordingCovered(backend, "repay success", ALL_BOUNDARIES);
});

test("keeps the form open and names the revert when the repay is mined but reverted", async ({
  page,
}) => {
  const { backend, write, dialog, submit } = await openRepayForm(page, {
    kind: "reverts",
    revertData: encodeErrorResult({
      abi: SPOKE_ABI,
      errorName: "ReservePaused",
    }),
  });

  await submit.click();

  await expect(
    dialog.getByText(TRANSACTION_FAILED, { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(RESERVE_PAUSED, { exact: true })).toBeVisible();
  await expect(dialog.getByText(REPAY_SUCCESSFUL, { exact: true })).toHaveCount(
    0,
  );
  // The amount stays for another try, and the dialog can be left.
  await expect(submit).toHaveText(REPAY_LABEL);
  await expect(submit).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: CLOSE_LABEL, exact: true }),
  ).toBeVisible();
  expectOneRepaySent(write);

  assertRecordingCovered(backend, "repay reverted", ALL_BOUNDARIES);
});

test("reports a repay the wallet refused as nonce too low as possibly sent, and does not send it again", async ({
  page,
}) => {
  const { backend, write, dialog, submit } = await openRepayForm(page, {
    kind: "refusedAsNonceTooLow",
  });

  await submit.click();

  await expect(
    dialog.getByText(SEND_OUTCOME_UNKNOWN, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(TRANSACTION_FAILED, { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByText(REPAY_SUCCESSFUL, { exact: true })).toHaveCount(
    0,
  );
  // It may have gone through, so the same repay is not one click away.
  await expect(submit).toHaveText(ENTER_AMOUNT_LABEL);
  await expect(submit).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: CLOSE_LABEL, exact: true }),
  ).toBeVisible();
  expectOneRepaySent(write);

  assertRecordingCovered(
    backend,
    "repay refused as nonce too low",
    ALL_BOUNDARIES,
  );
});
