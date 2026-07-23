/**
 * Demo mocks (dev / QA only — gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * The god-mode panel builds a LIST of mock items that render inside the REAL
 * dashboard sections, so you can preview many states at once. Each item has a
 * TYPE (deposit / withdrawal / collateral / loan / activity) and a STATE; the
 * state decides which section it lands in (e.g. a deposit in an expired state
 * renders under Expired Deposits; a withdrawal in the payout-sent state under
 * Withdrawals; a loan under Active Loans on the v3 Loans page; an activity row
 * in the v3 Activity feed).
 *
 * How it stays safe and fully inert when off:
 *  - States are built by the REAL state machines (getPeginState /
 *    getPegoutDisplayState), so the gallery can't drift from production.
 *  - Demo activities are injected ONLY into the section render lists (never into
 *    `allActivities`), so they are never polled. Click handlers no-op for them,
 *    with one deliberate exception: owned flow-state deposit cards open the real
 *    deposit multistepper, which walks the flow SAFELY — read-only progress per
 *    step, plus a SIMULATED activation (see {@link getDemoStepperBatch} /
 *    {@link submitDemoVaultActivation} and DemoActivationContent) — never the
 *    real wallet/registry/contract path.
 *  - When the flag is off (or the toggle is off), the hooks return null and
 *    nothing is injected — zero behavioural change.
 */

import { useMemo, useSyncExternalStore } from "react";
import type { Hex } from "viem";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import type { ActiveLoanRow } from "@/applications/aave/hooks/useActiveLoans";
import {
  getStepLabel,
  getVisualStep,
} from "@/components/simple/DepositProgressView/steps";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PegoutPollingResult } from "@/hooks/usePegoutPolling";
import {
  ContractStatus,
  getPeginState,
  type GetPeginStateOptions,
  LocalStorageStatus,
} from "@/models/peginStateMachine";
import {
  ClaimerPegoutStatusValue,
  getPegoutDisplayState,
  TIMED_OUT_STATE,
} from "@/models/pegoutStateMachine";
import { VAULT_COLLATERAL_ASSET } from "@/services/activity/projection";
import { getCurrencyIconWithFallback } from "@/services/token/tokenService";
import type { VaultActivity } from "@/types/activity";
import { type ActivityRow, PENDING_DEPOSIT_TYPE } from "@/types/activityLog";
import type { CollateralVaultEntry } from "@/types/collateral";
import type { DepositPollingResult } from "@/types/peginPolling";
import type { VaultProvider } from "@/types/vaultProvider";
import { getBatchSiblings } from "@/utils/batchedPegin";

/** Whether (and how) a scenario is expected to render the action CTA. */
export type DemoCta = "primary" | "outlined" | "none";

/** Denomination of a mock's amount — what the panel labels its amount field
 *  with, and the unit of the value that mock actually renders. */
export type DemoAmountUnit = string;

/** Deposit / withdrawal / collateral cards render the literal "BTC" (see
 *  `buildActivity`), while activity rows render the network-aware collateral
 *  symbol ("sBTC" on signet) — so the label a mock's amount field carries has
 *  to follow whichever list builds it, not one global spelling. */
const BTC_AMOUNT_UNIT = "BTC";

/** The kind of thing a mock item represents. */
export type DemoType =
  | "deposit"
  | "withdrawal"
  | "collateral"
  | "loan"
  | "activity";

/** One mock item the panel manages. `batched` only applies to deposits. */
export interface DemoItem {
  /** Stable unique key (React keys + derived on-chain-ish ids). */
  key: number;
  type: DemoType;
  /** Index into the type's scenario list (see {@link scenariosForType}). */
  stateIndex: number;
  /** This item's BTC amount (per-item, not global). */
  amount: string;
  /** Deposit-only: share a Pre-Pegin with other batched deposits (one group). */
  batched: boolean;
}

/** Minimal shape every scenario list shares (used by the panel's selects). */
interface BaseScenario {
  key: string;
  label: string;
  expectedCta: DemoCta;
}

/** One controllable deposit state. */
export interface DemoScenario extends BaseScenario {
  contractStatus: ContractStatus;
  options: GetPeginStateOptions;
  overrides?: Partial<DepositPollingResult>;
}

const DEMO_PROVIDER_ID = `0x${"cd".repeat(20)}`;
/** Shared Pre-Pegin so batched deposits group together. */
const DEMO_BATCH_PREPEGIN = `0x${"bc".repeat(32)}`;
const DEMO_OWNER_PUBKEY = "a".repeat(64);
const DEMO_PEGIN_TX = `0x${"d1".repeat(32)}` as Hex;
const DEMO_PREPEGIN_TX = `0x${"e1".repeat(32)}` as Hex;
const DEMO_CLAIM_TXID = "c".repeat(64);
const DEMO_ASSERT_TXID = "a2".repeat(32);
const DEMO_PEGOUT_PEGIN_TXID = "d1".repeat(32);
const DEFAULT_DEMO_AMOUNT = "0.0375";
const DEMO_REQUIRED_DEPTH = 6;
/** Fixed timestamp (2025-10-16 11:48:47 UTC) so date rows are stable. */
const DEMO_TIMESTAMP = 1760665727000;
const DEMO_AT_SECONDS = Math.floor(DEMO_TIMESTAMP / 1000);

const DEMO_VAULT_PROVIDER: VaultProvider = {
  id: DEMO_PROVIDER_ID,
  btcPubKey: `0x${"f".repeat(64)}`,
  name: "demo-vault-provider",
  url: "https://demo-vault-provider.invalid",
  metadataStatus: "ok",
};

/** Unique, deterministic hex id per mock item (no on-chain meaning). */
function itemHexId(key: number): Hex {
  return `0x${key.toString(16).padStart(40, "0")}` as Hex;
}

// --- Deposit scenarios -----------------------------------------------------

/**
 * Per-flow-step config for the deposit walk (steps 1–15 in order).
 *
 * Steps with a real resting card state use it (so the natural step + CTA
 * render); the transient/pre-card steps (1–4, 10, 11, 14) have no resting state,
 * so they force the step via `displayStepOverride` on a no-action base.
 */
interface FlowStepConfig {
  step: DepositFlowStep;
  expectedCta: DemoCta;
  contractStatus: ContractStatus;
  options: GetPeginStateOptions;
  forceStep?: boolean;
  extra?: Partial<DepositPollingResult>;
}

const NO_ACTION_PENDING: Pick<FlowStepConfig, "contractStatus" | "options"> = {
  contractStatus: ContractStatus.PENDING,
  options: { transactionsReady: false },
};

const PENDING_FLOW_CONFIG: FlowStepConfig[] = [
  {
    step: DepositFlowStep.DERIVE_VAULT_SECRET,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.SIGN_PEGIN_BTC,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.SIGN_POP,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.SUBMIT_PEGIN,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.BROADCAST_PRE_PEGIN,
    expectedCta: "primary",
    contractStatus: ContractStatus.PENDING,
    options: { pendingIngestion: true, transactionsReady: false },
  },
  {
    step: DepositFlowStep.AWAIT_BTC_CONFIRMATION,
    expectedCta: "none",
    contractStatus: ContractStatus.PENDING,
    options: {
      pendingIngestion: true,
      prePeginBroadcastSeen: true,
      transactionsReady: false,
    },
    extra: { prePeginConfirmations: 2 },
  },
  {
    step: DepositFlowStep.SUBMIT_WOTS_KEYS,
    expectedCta: "primary",
    contractStatus: ContractStatus.PENDING,
    options: { needsWotsKey: true },
  },
  {
    step: DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS,
    expectedCta: "none",
    contractStatus: ContractStatus.PENDING,
    options: { pendingIngestion: false, transactionsReady: false },
    extra: { prePeginConfirmations: 4 },
  },
  {
    step: DepositFlowStep.SIGN_AUTH_ANCHOR,
    expectedCta: "primary",
    contractStatus: ContractStatus.PENDING,
    options: { transactionsReady: true },
  },
  {
    step: DepositFlowStep.SIGN_PAYOUTS,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.AWAIT_VP_VERIFICATION,
    expectedCta: "none",
    contractStatus: ContractStatus.PENDING,
    options: { localStatus: LocalStorageStatus.PAYOUT_SIGNED },
  },
  {
    step: DepositFlowStep.RETRIEVE_SECRET,
    expectedCta: "primary",
    contractStatus: ContractStatus.VERIFIED,
    options: {},
  },
  {
    step: DepositFlowStep.ACTIVATE_VAULT,
    expectedCta: "none",
    ...NO_ACTION_PENDING,
    forceStep: true,
  },
  {
    step: DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION,
    expectedCta: "none",
    contractStatus: ContractStatus.VERIFIED,
    options: { localStatus: LocalStorageStatus.CONFIRMED },
  },
];

const PENDING_FLOW_SCENARIOS: DemoScenario[] = PENDING_FLOW_CONFIG.map(
  (config) => ({
    key: `pending-step-${getVisualStep(config.step)}`,
    label: `Step ${getVisualStep(config.step)}: ${getStepLabel(config.step)}`,
    expectedCta: config.expectedCta,
    contractStatus: config.contractStatus,
    options: config.options,
    overrides: {
      ...(config.forceStep ? { displayStepOverride: config.step } : {}),
      ...config.extra,
    },
  }),
);

const UNOWNED: Partial<DepositPollingResult> = {
  isOwnedByCurrentWallet: false,
  depositorBtcPubkey: "f".repeat(64),
};

/** The "Expired" mode's sub-states — the panel slider scrubs across these. */
const DEPOSIT_EXPIRED_SCENARIOS: DemoScenario[] = [
  {
    key: "expired-refundable",
    label: "Expired — refund available",
    expectedCta: "outlined",
    contractStatus: ContractStatus.EXPIRED,
    options: { canRefund: true, refundMaturityState: "mature" },
  },
  {
    key: "expired-maturing",
    label: "Expired — refund maturing",
    expectedCta: "none",
    contractStatus: ContractStatus.EXPIRED,
    options: {
      canRefund: false,
      refundMaturityState: "maturing",
      refundMaturesInBlocks: 18,
    },
  },
  {
    key: "expired-maturity-unknown",
    label: "Expired — refund maturity unknown",
    expectedCta: "none",
    contractStatus: ContractStatus.EXPIRED,
    options: { refundMaturityState: "unknown" },
  },
  {
    key: "expired-refunding",
    label: "Expired — refund in flight",
    expectedCta: "none",
    contractStatus: ContractStatus.EXPIRED,
    options: { refundSettlement: "pending" },
  },
  {
    key: "expired-refunded",
    label: "Expired — refunded",
    expectedCta: "none",
    contractStatus: ContractStatus.EXPIRED,
    options: { refundSettlement: "confirmed" },
  },
];

/** The "Different wallet" mode — a single disabled, unowned-vault state. */
const DIFFERENT_WALLET_SCENARIOS: DemoScenario[] = [
  {
    key: "unowned-disabled",
    label: "Different wallet (disabled)",
    expectedCta: "none",
    contractStatus: ContractStatus.VERIFIED,
    options: {},
    overrides: UNOWNED,
  },
];

/** Resting state after the whole walk: the contract reports the vault ACTIVE.
 *  Also the terminal the simulated activation lands on. */
const ACTIVATED_SCENARIO: DemoScenario = {
  key: "activated",
  label: "Activated (vault active)",
  expectedCta: "none",
  contractStatus: ContractStatus.ACTIVE,
  options: {},
};

/** The ordered deposit flow: the 15 steps then the activated terminal. The
 *  panel presents these on the step slider. */
const DEPOSIT_FLOW_SCENARIOS: DemoScenario[] = [
  ...PENDING_FLOW_SCENARIOS,
  ACTIVATED_SCENARIO,
];

/** All deposit states as one flat list, grouped by panel "mode": the flow
 *  prefix (Normal), then the expired variants (Expired), then the
 *  different-wallet states. A `DemoItem.stateIndex` addresses any of them; the
 *  panel derives the mode + within-mode offset from the segment boundaries
 *  below. The chosen state's contract status decides the rendering section. */
export const DEPOSIT_SCENARIOS: DemoScenario[] = [
  ...DEPOSIT_FLOW_SCENARIOS,
  ...DEPOSIT_EXPIRED_SCENARIOS,
  ...DIFFERENT_WALLET_SCENARIOS,
];

/** Length of the "Normal" flow segment leading {@link DEPOSIT_SCENARIOS}. */
export const DEPOSIT_FLOW_SCENARIO_COUNT = DEPOSIT_FLOW_SCENARIOS.length;

/** Length of the "Expired" segment that follows the flow prefix. */
export const DEPOSIT_EXPIRED_SCENARIO_COUNT = DEPOSIT_EXPIRED_SCENARIOS.length;

/** Length of the trailing "Different wallet" segment. */
export const DEPOSIT_DIFFERENT_WALLET_SCENARIO_COUNT =
  DIFFERENT_WALLET_SCENARIOS.length;

/** Index into {@link DEPOSIT_SCENARIOS} for a pending-flow step (the flow
 *  scenarios lead the list, so the config index carries over). */
function flowScenarioIndex(step: DepositFlowStep): number {
  const index = PENDING_FLOW_CONFIG.findIndex((config) => config.step === step);
  if (index === -1) {
    throw new Error(`No pending-flow demo scenario for step ${step}`);
  }
  return index;
}

/** "Ready to activate" (VERIFIED, primary Activate CTA) — the state the
 *  simulated activation starts from. */
export const READY_TO_ACTIVATE_SCENARIO_INDEX = flowScenarioIndex(
  DepositFlowStep.RETRIEVE_SECRET,
);
/** Optimistic post-submit state (VERIFIED + CONFIRMED, "activation
 *  submitted") — already `isVaultActivated`, so the stepper shows success. */
export const ACTIVATION_CONFIRMING_SCENARIO_INDEX = flowScenarioIndex(
  DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION,
);
/** Terminal ACTIVE state the simulated confirmation lands on. */
export const ACTIVATED_SCENARIO_INDEX =
  DEPOSIT_SCENARIOS.indexOf(ACTIVATED_SCENARIO);

// --- Withdrawal (peg-out) scenarios ----------------------------------------

/** One controllable withdrawal (peg-out) state. Withdrawals never show a CTA. */
export interface WithdrawalScenario extends BaseScenario {
  claimerStatus?: ClaimerPegoutStatusValue;
  found: boolean;
  timedOut?: boolean;
}

export const WITHDRAWAL_SCENARIOS: WithdrawalScenario[] = [
  {
    key: "wd-initiating",
    label: "Initiating",
    expectedCta: "none",
    found: false,
  },
  {
    key: "wd-claim-received",
    label: "Submitted (claim received)",
    expectedCta: "none",
    claimerStatus: ClaimerPegoutStatusValue.CLAIM_EVENT_RECEIVED,
    found: true,
  },
  {
    key: "wd-claim-broadcast",
    label: "In progress (claim broadcast)",
    expectedCta: "none",
    claimerStatus: ClaimerPegoutStatusValue.CLAIM_BROADCAST,
    found: true,
  },
  {
    key: "wd-assert-broadcast",
    label: "Challenge period (assert broadcast)",
    expectedCta: "none",
    claimerStatus: ClaimerPegoutStatusValue.ASSERT_BROADCAST,
    found: true,
  },
  {
    key: "wd-payout-sent",
    label: "Payout sent",
    expectedCta: "none",
    claimerStatus: ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
    found: true,
  },
  {
    key: "wd-blocked",
    label: "Blocked (contact support)",
    expectedCta: "none",
    claimerStatus: ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
    found: true,
  },
  {
    key: "wd-timed-out",
    label: "Status unavailable (timed out)",
    expectedCta: "none",
    found: false,
    timedOut: true,
  },
];

// --- Collateral (active vault) scenarios -----------------------------------

/** One controllable collateral (active vault) state. Collateral has no CTA. */
export interface CollateralScenario extends BaseScenario {
  inUse: boolean;
  isActivating?: boolean;
}

export const COLLATERAL_SCENARIOS: CollateralScenario[] = [
  {
    key: "col-available",
    label: "Available (not in use)",
    expectedCta: "none",
    inUse: false,
  },
  {
    key: "col-in-use",
    label: "In use as collateral",
    expectedCta: "none",
    inUse: true,
  },
  {
    key: "col-activating",
    label: "Activating (optimistic)",
    expectedCta: "none",
    inUse: false,
    isActivating: true,
  },
];

// --- Loan (borrowed asset) scenarios ---------------------------------------

/** One controllable loan row on the v3 Loans page. Loans have no card CTA of
 *  their own — the row's Borrow/Repay buttons are always disabled for a mock
 *  (see {@link buildLoansDemo}), so every scenario is `expectedCta: "none"`. */
export interface LoanScenario extends BaseScenario {
  symbol: string;
  /** false → the per-reserve liquidity read is loading or failed (row shows –). */
  hasLiquidity: boolean;
  /** false → the reserve no longer accepts borrows (repay-only row). */
  isBorrowable: boolean;
  /** false → the borrow-APR read hasn't resolved yet (row shows –). */
  hasBorrowRate: boolean;
}

const DEMO_LOAN_SYMBOL = "USDC";
const DEMO_LOAN_BORROW_RATE = "5.861%";
const DEMO_LOAN_AVAILABLE_LIQUIDITY = 1_250_000;
/** 64.20% utilization. */
const DEMO_LOAN_UTILIZATION_BPS = 6420;
/** Prefix for a mock row's reserve id. Real ids are decimal `reserveId`
 *  strings, so this can never collide with one. */
const DEMO_LOAN_RESERVE_PREFIX = "demo-reserve-";

export const LOAN_SCENARIOS: LoanScenario[] = [
  {
    key: "loan-borrowable",
    label: "Borrowable reserve",
    expectedCta: "none",
    symbol: DEMO_LOAN_SYMBOL,
    hasLiquidity: true,
    isBorrowable: true,
    hasBorrowRate: true,
  },
  {
    key: "loan-repay-only",
    label: "Repay only (reserve frozen)",
    expectedCta: "none",
    symbol: DEMO_LOAN_SYMBOL,
    hasLiquidity: true,
    isBorrowable: false,
    hasBorrowRate: true,
  },
  {
    key: "loan-no-liquidity-read",
    label: "Liquidity / utilization unavailable",
    expectedCta: "none",
    symbol: DEMO_LOAN_SYMBOL,
    hasLiquidity: false,
    isBorrowable: true,
    hasBorrowRate: true,
  },
  {
    key: "loan-apr-pending",
    label: "Borrow APR pending",
    expectedCta: "none",
    symbol: DEMO_LOAN_SYMBOL,
    hasLiquidity: true,
    isBorrowable: true,
    hasBorrowRate: false,
  },
];

// --- Activity-log scenarios (v3 Activity page) -----------------------------

/**
 * One controllable row on the Activity page. `build` returns the finished
 * {@link ActivityRow} because the page renders two different row kinds (a flat
 * log row and an expandable liquidation group) — a single flat config could not
 * describe both without inventing a schema neither production type uses.
 */
export interface ActivityScenario extends BaseScenario {
  /** Days back from now, so a multi-mock list also exercises the v3
   *  Today / Yesterday / dated group headers. */
  daysAgo: number;
  /** Denomination of the row's headline amount — the one the panel's amount
   *  field drives, and the unit it labels that field with. */
  unit: DemoAmountUnit;
  build: (id: string, date: Date, amount: string) => ActivityRow;
}

/** Prefix for a mock activity row's id — real ids are indexer event ids. */
const DEMO_ACTIVITY_ID_PREFIX = "demo-activity-";
/** What an activity row actually renders for BTC amounts. */
const ACTIVITY_BTC_UNIT = VAULT_COLLATERAL_ASSET.symbol;
const DEMO_ACTIVITY_DEBT_SYMBOL = "USDC";
/** Debt figure shown BESIDE the seized collateral on a liquidation card. A
 *  liquidation row has two amounts and the panel drives only one (the
 *  collateral, its headline), so this second one stays a fixed sample. */
const DEMO_LIQUIDATION_DEBT_AMOUNT = "12,500.00";
/** BTC txids render without the 0x prefix; EVM event hashes with it. */
const DEMO_ACTIVITY_BTC_TXID = "b7".repeat(32);
const DEMO_ACTIVITY_ETH_TX = `0x${"e7".repeat(32)}`;

function demoDebtIcon(): string {
  return getCurrencyIconWithFallback(undefined, DEMO_ACTIVITY_DEBT_SYMBOL);
}

/** Flat log row shared by every non-liquidation scenario. */
function demoActivityLog(
  id: string,
  date: Date,
  fields: Pick<ActivityRow & { kind: "row" }, "type" | "amount" | "chain"> &
    Partial<Pick<ActivityRow & { kind: "row" }, "isPending" | "isExpired">> & {
      tokenIcon?: string;
      transactionHash?: string;
    },
): ActivityRow {
  const { tokenIcon, transactionHash, ...rest } = fields;
  return {
    kind: "row",
    id,
    date,
    tokenIcon: tokenIcon ?? VAULT_COLLATERAL_ASSET.icon,
    transactionHash:
      transactionHash ??
      (rest.chain === "BTC" ? DEMO_ACTIVITY_BTC_TXID : DEMO_ACTIVITY_ETH_TX),
    ...rest,
  };
}

function demoBtcAmount(amount: string) {
  return { value: amount, symbol: VAULT_COLLATERAL_ASSET.symbol };
}

/** Borrow / repay rows are denominated in the debt asset, so the panel's
 *  amount drives them directly. */
function demoDebtAmount(amount: string) {
  return { value: amount, symbol: DEMO_ACTIVITY_DEBT_SYMBOL };
}

function demoLiquidationDebtAmount() {
  return {
    value: DEMO_LIQUIDATION_DEBT_AMOUNT,
    symbol: DEMO_ACTIVITY_DEBT_SYMBOL,
  };
}

export const ACTIVITY_SCENARIOS: ActivityScenario[] = [
  {
    key: "act-deposit",
    label: "Deposit (confirmed)",
    expectedCta: "none",
    daysAgo: 0,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: "Deposit",
        amount: demoBtcAmount(amount),
        chain: "BTC",
      }),
  },
  {
    key: "act-deposit-pending",
    label: "Deposit (pending, spinner)",
    expectedCta: "none",
    daysAgo: 0,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: PENDING_DEPOSIT_TYPE,
        amount: demoBtcAmount(amount),
        chain: "BTC",
        isPending: true,
        transactionHash: "",
      }),
  },
  {
    key: "act-deposit-expired",
    label: "Deposit (expired, refunded)",
    expectedCta: "none",
    daysAgo: 1,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: "Deposit",
        amount: demoBtcAmount(amount),
        chain: "BTC",
        isExpired: true,
      }),
  },
  {
    key: "act-withdraw",
    label: "Withdraw",
    expectedCta: "none",
    daysAgo: 1,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: "Withdraw",
        amount: demoBtcAmount(amount),
        chain: "BTC",
      }),
  },
  {
    key: "act-borrow",
    label: "Borrow",
    expectedCta: "none",
    daysAgo: 2,
    unit: DEMO_ACTIVITY_DEBT_SYMBOL,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: "Borrow",
        amount: demoDebtAmount(amount),
        chain: "ETH",
        tokenIcon: demoDebtIcon(),
      }),
  },
  {
    key: "act-repay",
    label: "Repay",
    expectedCta: "none",
    daysAgo: 2,
    unit: DEMO_ACTIVITY_DEBT_SYMBOL,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: "Repay",
        amount: demoDebtAmount(amount),
        chain: "ETH",
        tokenIcon: demoDebtIcon(),
      }),
  },
  {
    key: "act-redeem",
    label: "Redeem",
    expectedCta: "none",
    daysAgo: 5,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) =>
      demoActivityLog(id, date, {
        type: "Redeem",
        amount: demoBtcAmount(amount),
        chain: "ETH",
      }),
  },
  {
    key: "act-liquidation-partial",
    label: "Partially liquidated (group)",
    expectedCta: "none",
    daysAgo: 5,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) => ({
      kind: "liquidationGroup",
      id,
      date,
      type: "Partially Liquidated",
      tokenIcons: [VAULT_COLLATERAL_ASSET.icon, demoDebtIcon()],
      summary: {
        collateral: demoBtcAmount(amount),
        debt: demoLiquidationDebtAmount(),
      },
      children: [
        {
          id: `${id}-collateral`,
          label: COPY.activity.liquidation.collateralLabel,
          amount: demoBtcAmount(amount),
          tokenIcon: VAULT_COLLATERAL_ASSET.icon,
          chain: "ETH",
          transactionHash: DEMO_ACTIVITY_ETH_TX,
          date,
        },
        {
          id: `${id}-loan`,
          label: COPY.activity.liquidation.repaidLabel,
          amount: demoLiquidationDebtAmount(),
          tokenIcon: demoDebtIcon(),
          chain: "ETH",
          transactionHash: DEMO_ACTIVITY_ETH_TX,
          date,
        },
      ],
      transactionHash: DEMO_ACTIVITY_ETH_TX,
    }),
  },
  {
    key: "act-liquidation-full",
    label: "Fully liquidated (group, no repay)",
    expectedCta: "none",
    daysAgo: 6,
    unit: ACTIVITY_BTC_UNIT,
    build: (id, date, amount) => ({
      kind: "liquidationGroup",
      id,
      date,
      type: "Fully Liquidated",
      tokenIcons: [VAULT_COLLATERAL_ASSET.icon, ""],
      summary: { collateral: demoBtcAmount(amount), debt: null },
      children: [
        {
          id: `${id}-collateral`,
          label: COPY.activity.liquidation.collateralLabel,
          amount: demoBtcAmount(amount),
          tokenIcon: VAULT_COLLATERAL_ASSET.icon,
          chain: "ETH",
          transactionHash: DEMO_ACTIVITY_ETH_TX,
          date,
        },
      ],
      transactionHash: DEMO_ACTIVITY_ETH_TX,
    }),
  },
];

/** Scenario list for a given mock type (drives the panel's state select). */
export function scenariosForType(type: DemoType): BaseScenario[] {
  if (type === "withdrawal") return WITHDRAWAL_SCENARIOS;
  if (type === "collateral") return COLLATERAL_SCENARIOS;
  if (type === "loan") return LOAN_SCENARIOS;
  if (type === "activity") return ACTIVITY_SCENARIOS;
  return DEPOSIT_SCENARIOS;
}

/**
 * Unit the item's amount is denominated in — the panel labels its amount field
 * with this. Loans borrow the debt asset; activity rows vary per scenario
 * (borrow / repay are debt-denominated, the rest are BTC); everything else is
 * BTC. Kept here rather than in the panel so it can't drift from the scenario
 * that renders the value.
 */
export function amountUnitFor(item: DemoItem): DemoAmountUnit {
  if (item.type === "loan") return DEMO_LOAN_SYMBOL;
  if (item.type === "activity") {
    const scenario = ACTIVITY_SCENARIOS[item.stateIndex];
    return scenario?.unit ?? ACTIVITY_BTC_UNIT;
  }
  return BTC_AMOUNT_UNIT;
}

/** Which dashboard section a mock item renders in (panel hint, derived from
 *  type + state). */
export function itemSectionHint(item: DemoItem): string {
  if (item.type === "withdrawal") {
    // v2 only: the v3 /vaults page has no withdrawal section yet (the
    // relocation step of #2041), so a withdrawal mock renders nothing there.
    const scenario = WITHDRAWAL_SCENARIOS[item.stateIndex];
    return scenario?.claimerStatus === ClaimerPegoutStatusValue.PAYOUT_BROADCAST
      ? "Withdrawals (v2 only)"
      : "Pending Withdrawals (v2 only)";
  }
  if (item.type === "collateral") {
    return "BTC Vaults (v2) / Active Vaults (v3 Vaults)";
  }
  if (item.type === "loan") return "Active Loans (v3 Loans)";
  if (item.type === "activity") return "Activity feed (v3 Activity)";
  const scenario = DEPOSIT_SCENARIOS[item.stateIndex];
  if (scenario?.contractStatus === ContractStatus.EXPIRED) {
    return "Expired Deposits (v2) / Inactive Vaults (v3)";
  }
  return item.batched ? "Pending Deposits (batched group)" : "Pending Deposits";
}

// --- Per-item builders -----------------------------------------------------

function buildResult(
  depositId: Hex,
  scenario: DemoScenario,
): DepositPollingResult {
  return {
    depositId,
    loading: false,
    error: null,
    peginState: getPeginState(scenario.contractStatus, scenario.options),
    isOwnedByCurrentWallet: true,
    depositorBtcPubkey: DEMO_OWNER_PUBKEY,
    prePeginConfirmations: null,
    requiredPrePeginDepth: DEMO_REQUIRED_DEPTH,
    ...scenario.overrides,
  };
}

function buildActivity(
  id: Hex,
  result: DepositPollingResult,
  unsignedPrePeginTx: string,
  amount: string,
): VaultActivity {
  return {
    id,
    collateral: { amount, symbol: "BTC" },
    providers: [{ id: DEMO_PROVIDER_ID }],
    displayLabel: result.peginState.displayLabel,
    contractStatus: result.peginState.contractStatus,
    peginTxHash: DEMO_PEGIN_TX,
    prePeginTxHash: DEMO_PREPEGIN_TX,
    depositorBtcPubkey: result.depositorBtcPubkey,
    timestamp: DEMO_TIMESTAMP,
    unsignedPrePeginTx,
    depositorWotsPkHash: "",
  };
}

function buildWithdrawVault(id: Hex, amount: string): RedeemedVaultInfo {
  return {
    id,
    peginTxHash: DEMO_PEGIN_TX,
    prePeginTxHash: DEMO_PREPEGIN_TX,
    amountBtc: Number.parseFloat(amount) || 0,
    providerName: DEMO_VAULT_PROVIDER.name ?? "demo-vault-provider",
    vaultProviderAddress: DEMO_PROVIDER_ID,
    createdAt: DEMO_TIMESTAMP,
    offchainParamsVersion: 0,
  };
}

function buildPegoutResult(scenario: WithdrawalScenario): PegoutPollingResult {
  if (scenario.timedOut) {
    return { displayState: TIMED_OUT_STATE };
  }
  if (!scenario.claimerStatus) {
    return {
      displayState: getPegoutDisplayState(undefined, false),
      response: {
        pegin_txid: DEMO_PEGOUT_PEGIN_TXID,
        found: false,
        claimer: null,
        challengers: [],
      },
    };
  }
  return {
    displayState: getPegoutDisplayState(scenario.claimerStatus, true),
    response: {
      pegin_txid: DEMO_PEGOUT_PEGIN_TXID,
      found: true,
      claimer: {
        status: scenario.claimerStatus,
        failed:
          scenario.claimerStatus === ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
        claim_txid: DEMO_CLAIM_TXID,
        claimer_pubkey: DEMO_OWNER_PUBKEY,
        assert_txid: DEMO_ASSERT_TXID,
        created_at: DEMO_AT_SECONDS,
        updated_at: DEMO_AT_SECONDS,
      },
      challengers: [],
    },
  };
}

function buildCollateralEntry(
  id: Hex,
  scenario: CollateralScenario,
  amount: string,
): CollateralVaultEntry {
  return {
    id,
    vaultId: id,
    peginTxHash: DEMO_PEGIN_TX,
    prePeginTxHash: DEMO_PREPEGIN_TX,
    amountBtc: Number.parseFloat(amount) || 0,
    addedAt: DEMO_AT_SECONDS,
    inUse: scenario.inUse,
    isActivating: scenario.isActivating,
    displayOnly: true,
    providerAddress: DEMO_PROVIDER_ID,
    providerName: DEMO_VAULT_PROVIDER.name ?? "demo-vault-provider",
    depositorBtcPubkey: DEMO_OWNER_PUBKEY,
    liquidationIndex: 0,
    offchainParamsVersion: 0,
  };
}

// --- Aggregate demo shapes (one per consuming section) ---------------------

export interface ActiveDemo {
  pendingActivities: VaultActivity[];
  expiredActivities: VaultActivity[];
  resultsById: Map<string, DepositPollingResult>;
  provider: VaultProvider;
  hideReal: boolean;
}

export interface ActiveDemoWithdrawal {
  vaults: RedeemedVaultInfo[];
  statuses: Map<string, PegoutPollingResult>;
  hideReal: boolean;
}

export interface ActiveDemoCollateral {
  vaults: CollateralVaultEntry[];
  hideReal: boolean;
}

export interface ActiveDemoActivity {
  rows: ActivityRow[];
  hideReal: boolean;
}

export interface ActiveDemoLoan {
  rows: ActiveLoanRow[];
  /** Total mock debt in USD — the Loans summary totals the rendered rows. */
  debtUsd: number;
  hideReal: boolean;
}

export function buildDepositsDemo(
  items: DemoItem[],
  hideReal: boolean,
): ActiveDemo {
  const pendingActivities: VaultActivity[] = [];
  const expiredActivities: VaultActivity[] = [];
  const resultsById = new Map<string, DepositPollingResult>();
  for (const item of items) {
    if (item.type !== "deposit") continue;
    const scenario = DEPOSIT_SCENARIOS[item.stateIndex] ?? DEPOSIT_SCENARIOS[0];
    const id = itemHexId(item.key);
    const result = buildResult(id, scenario);
    resultsById.set(id, result);
    const isExpired = scenario.contractStatus === ContractStatus.EXPIRED;
    const unsignedPrePeginTx =
      item.batched && !isExpired ? DEMO_BATCH_PREPEGIN : "";
    const activity = buildActivity(
      id,
      result,
      unsignedPrePeginTx,
      safeAmount(item.amount),
    );
    if (isExpired) expiredActivities.push(activity);
    else pendingActivities.push(activity);
  }
  return {
    pendingActivities,
    expiredActivities,
    resultsById,
    provider: DEMO_VAULT_PROVIDER,
    hideReal,
  };
}

export function buildWithdrawalsDemo(
  items: DemoItem[],
  hideReal: boolean,
): ActiveDemoWithdrawal {
  const vaults: RedeemedVaultInfo[] = [];
  const statuses = new Map<string, PegoutPollingResult>();
  for (const item of items) {
    if (item.type !== "withdrawal") continue;
    const scenario =
      WITHDRAWAL_SCENARIOS[item.stateIndex] ?? WITHDRAWAL_SCENARIOS[0];
    const id = itemHexId(item.key);
    vaults.push(buildWithdrawVault(id, safeAmount(item.amount)));
    statuses.set(id, buildPegoutResult(scenario));
  }
  return { vaults, statuses, hideReal };
}

export function buildCollateralsDemo(
  items: DemoItem[],
  hideReal: boolean,
): ActiveDemoCollateral {
  const vaults: CollateralVaultEntry[] = [];
  for (const item of items) {
    if (item.type !== "collateral") continue;
    const scenario =
      COLLATERAL_SCENARIOS[item.stateIndex] ?? COLLATERAL_SCENARIOS[0];
    vaults.push(
      buildCollateralEntry(
        itemHexId(item.key),
        scenario,
        safeAmount(item.amount),
      ),
    );
  }
  return { vaults, hideReal };
}

export function buildLoansDemo(
  items: DemoItem[],
  hideReal: boolean,
): ActiveDemoLoan {
  const rows: ActiveLoanRow[] = [];
  let debtUsd = 0;
  for (const item of items) {
    if (item.type !== "loan") continue;
    const scenario = LOAN_SCENARIOS[item.stateIndex] ?? LOAN_SCENARIOS[0];
    const amount = safeAmount(item.amount);
    // The mock borrows a stablecoin, so the token amount doubles as its USD
    // value — enough for the summary to total the rendered rows.
    debtUsd += Number.parseFloat(amount) || 0;
    rows.push({
      reserveId: `${DEMO_LOAN_RESERVE_PREFIX}${item.key}`,
      symbol: scenario.symbol,
      name: scenario.symbol,
      amount,
      icon: getCurrencyIconWithFallback(undefined, scenario.symbol),
      borrowRate: scenario.hasBorrowRate ? DEMO_LOAN_BORROW_RATE : undefined,
      availableLiquidity: scenario.hasLiquidity
        ? DEMO_LOAN_AVAILABLE_LIQUIDITY
        : null,
      utilizationBps: scenario.hasLiquidity ? DEMO_LOAN_UTILIZATION_BPS : null,
      isBorrowable: scenario.isBorrowable,
      // Safety: the row's reserveId/symbol resolve to no real reserve, so both
      // of its actions stay disabled (ActiveLoansList) — a mock can never open
      // the borrow/repay overlay against a real position.
      displayOnly: true,
    });
  }
  return { rows, debtUsd, hideReal };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildActivitiesDemo(
  items: DemoItem[],
  hideReal: boolean,
): ActiveDemoActivity {
  const rows: ActivityRow[] = [];
  for (const item of items) {
    if (item.type !== "activity") continue;
    const scenario =
      ACTIVITY_SCENARIOS[item.stateIndex] ?? ACTIVITY_SCENARIOS[0];
    // Dates are relative to now (not the fixed DEMO_TIMESTAMP the card mocks
    // use) so the Today / Yesterday group headers render the way a depositor
    // would see them.
    rows.push(
      scenario.build(
        `${DEMO_ACTIVITY_ID_PREFIX}${item.key}`,
        new Date(Date.now() - scenario.daysAgo * MS_PER_DAY),
        safeAmount(item.amount),
      ),
    );
  }
  return { rows, hideReal };
}

// --- Cross-component store (the panel writes; the sections read) ------------

let itemCounter = 0;
function makeItem(type: DemoType): DemoItem {
  itemCounter += 1;
  return {
    key: itemCounter,
    type,
    stateIndex: 0,
    amount: DEFAULT_DEMO_AMOUNT,
    batched: false,
  };
}

// Injection starts OFF: merely setting the feature flag must not inject a
// mock (a demo card is pixel-identical to a real one) nor pay the merge cost
// on every dashboard render. The panel's "Inject demo" toggle opts in.
let storeEnabled = false;
let storeHideReal = false;
let storeItems: DemoItem[] = [makeItem("deposit")];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clampState(type: DemoType, index: number): number {
  return Math.max(0, Math.min(scenariosForType(type).length - 1, index));
}

export function setDemoEnabled(enabled: boolean) {
  storeEnabled = enabled;
  emit();
}

export function setDemoHideReal(hideReal: boolean) {
  storeHideReal = hideReal;
  emit();
}

export function addDemoItem(type: DemoType = "deposit") {
  storeItems = [...storeItems, makeItem(type)];
  emit();
}

export function removeDemoItem(key: number) {
  storeItems = storeItems.filter((item) => item.key !== key);
  emit();
}

export function setDemoItemType(key: number, type: DemoType) {
  // Scenario lists differ per type, so reset the state when the type changes.
  storeItems = storeItems.map((item) =>
    item.key === key ? { ...item, type, stateIndex: 0 } : item,
  );
  emit();
}

export function setDemoItemState(key: number, stateIndex: number) {
  storeItems = storeItems.map((item) =>
    item.key === key
      ? { ...item, stateIndex: clampState(item.type, stateIndex) }
      : item,
  );
  emit();
}

export function setDemoItemBatched(key: number, batched: boolean) {
  storeItems = storeItems.map((item) =>
    item.key === key ? { ...item, batched } : item,
  );
  emit();
}

export function setDemoItemAmount(key: number, amount: string) {
  storeItems = storeItems.map((item) =>
    item.key === key ? { ...item, amount } : item,
  );
  emit();
}

// --- Simulated activation --------------------------------------------------

/** Simulated on-chain lag between "activation submitted" (VERIFIED+CONFIRMED)
 *  and the contract reporting the vault ACTIVE. */
const DEMO_ACTIVATION_CONFIRM_MS = 2500;

/** In-flight simulated-confirmation timers keyed by demo vault id. */
const demoActivationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function findDemoDepositItem(vaultId: string): DemoItem | undefined {
  return storeItems.find(
    (item) => item.type === "deposit" && itemHexId(item.key) === vaultId,
  );
}

/**
 * Simulate submitting the activation transaction for a demo vault: advance the
 * item to the optimistic VERIFIED+CONFIRMED scenario immediately (mirroring the
 * real flow's `setOptimisticStatus(CONFIRMED)`), then to the ACTIVE terminal
 * after a simulated confirmation delay. No-op unless the item is currently at
 * "ready to activate", so a re-fire (StrictMode remount) can't double-advance.
 */
export function submitDemoVaultActivation(vaultId: string) {
  const item = findDemoDepositItem(vaultId);
  if (!item || item.stateIndex !== READY_TO_ACTIVATE_SCENARIO_INDEX) return;
  setDemoItemState(item.key, ACTIVATION_CONFIRMING_SCENARIO_INDEX);
  // A pending timer can only exist here if the user rewound the state by hand
  // and re-activated; replace it so the stale timer can't fire early.
  const existing = demoActivationTimers.get(vaultId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    demoActivationTimers.delete(vaultId);
    const current = findDemoDepositItem(vaultId);
    // The user may have removed the item or jumped its state mid-wait.
    if (!current || current.stateIndex !== ACTIVATION_CONFIRMING_SCENARIO_INDEX)
      return;
    setDemoItemState(current.key, ACTIVATED_SCENARIO_INDEX);
  }, DEMO_ACTIVATION_CONFIRM_MS);
  demoActivationTimers.set(vaultId, timer);
}

/**
 * Resolve a clicked demo deposit to the batch of owned vault ids the deposit
 * multistepper should open with, or `null` when the click must stay a no-op.
 *
 * Opens for any OWNED flow-state demo deposit (the 15 flow steps + the
 * activated terminal), so the whole Deposit Progress view can be walked with
 * god mode. Stays inert for a different-wallet (unowned) preview and for
 * expired deposits (those live in `expiredActivities`, not the pending list).
 *
 * There is no "would this auto-run real signing?" guard: for every demo id
 * PostDepositContinuationView renders a SAFE view (read-only progress, or the
 * simulated activation walk) — the real signing/registry branches never mount.
 */
export function getDemoStepperBatch(
  demo: ActiveDemo | null,
  depositId: string,
): Hex[] | null {
  if (!demo) return null;
  const activity = demo.pendingActivities.find((a) => a.id === depositId);
  if (!activity) return null;
  // Different-wallet demo cards are disabled previews — never open.
  if (!demo.resultsById.get(depositId)?.isOwnedByCurrentWallet) return null;
  return getBatchSiblings(demo.pendingActivities, activity)
    .filter((s) => demo.resultsById.get(s.id)?.isOwnedByCurrentWallet)
    .map((s) => s.id as Hex);
}

/** Reset to a single default deposit item (used by tests). */
export function resetDemoState() {
  for (const timer of demoActivationTimers.values()) clearTimeout(timer);
  demoActivationTimers.clear();
  storeEnabled = true;
  storeHideReal = false;
  itemCounter = 0;
  storeItems = [makeItem("deposit")];
  emit();
}

function getEnabledSnapshot() {
  return storeEnabled;
}
function getHideRealSnapshot() {
  return storeHideReal;
}
function getItemsSnapshot() {
  return storeItems;
}

export function useDemoEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    getEnabledSnapshot,
    getEnabledSnapshot,
  );
}
export function useDemoHideReal(): boolean {
  return useSyncExternalStore(
    subscribe,
    getHideRealSnapshot,
    getHideRealSnapshot,
  );
}
export function useDemoItems(): DemoItem[] {
  return useSyncExternalStore(subscribe, getItemsSnapshot, getItemsSnapshot);
}

function safeAmount(amount: string): string {
  return amount.trim() === "" ? "0" : amount;
}

/**
 * Aggregate demo deposits to inject, or null when off. Consumed by
 * usePendingDeposits (render lists) and PeginPollingContext (controlled
 * results). `hideReal` applies whenever a demo is on, so real deposits hide
 * even if no deposit item is configured.
 */
export function useDemoDeposit(): ActiveDemo | null {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();
  const flagOn = featureFlags.isGodModePanelEnabled;
  // The literal `import.meta.env.DEV` lets the bundler drop the build call (and
  // with it the scenarios/builders) from production.
  return useMemo(
    () =>
      import.meta.env.DEV && flagOn && enabled
        ? buildDepositsDemo(items, hideReal)
        : null,
    [flagOn, enabled, items, hideReal],
  );
}

/** Aggregate demo withdrawals to inject, or null when off. */
export function useDemoWithdrawal(): ActiveDemoWithdrawal | null {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();
  const flagOn = featureFlags.isGodModePanelEnabled;
  return useMemo(
    () =>
      import.meta.env.DEV && flagOn && enabled
        ? buildWithdrawalsDemo(items, hideReal)
        : null,
    [flagOn, enabled, items, hideReal],
  );
}

/** Aggregate demo activity rows to inject, or null when off. */
export function useDemoActivity(): ActiveDemoActivity | null {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();
  const flagOn = featureFlags.isGodModePanelEnabled;
  return useMemo(
    () =>
      import.meta.env.DEV && flagOn && enabled
        ? buildActivitiesDemo(items, hideReal)
        : null,
    [flagOn, enabled, items, hideReal],
  );
}

/** Aggregate demo loans to inject, or null when off. */
export function useDemoLoan(): ActiveDemoLoan | null {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();
  const flagOn = featureFlags.isGodModePanelEnabled;
  return useMemo(
    () =>
      import.meta.env.DEV && flagOn && enabled
        ? buildLoansDemo(items, hideReal)
        : null,
    [flagOn, enabled, items, hideReal],
  );
}

/** Aggregate demo collateral to inject, or null when off. */
export function useDemoCollateral(): ActiveDemoCollateral | null {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();
  const flagOn = featureFlags.isGodModePanelEnabled;
  return useMemo(
    () =>
      import.meta.env.DEV && flagOn && enabled
        ? buildCollateralsDemo(items, hideReal)
        : null,
    [flagOn, enabled, items, hideReal],
  );
}
