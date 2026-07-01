/**
 * Demo mocks (dev / QA only — gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * The god-mode panel builds a LIST of mock items that render inside the REAL
 * dashboard sections, so you can preview many states at once. Each item has a
 * TYPE (deposit / withdrawal / collateral) and a STATE; the state decides which
 * section it lands in (e.g. a deposit in an expired state renders under Expired
 * Deposits; a withdrawal in the payout-sent state under Withdrawals).
 *
 * How it stays safe and fully inert when off:
 *  - States are built by the REAL state machines (getPeginState /
 *    getPegoutDisplayState), so the gallery can't drift from production.
 *  - Demo activities are injected ONLY into the section render lists (never into
 *    `allActivities`), so they are never polled and every click handler no-ops
 *    for them.
 *  - When the flag is off (or the toggle is off), the hooks return null and
 *    nothing is injected — zero behavioural change.
 */

import { useMemo, useSyncExternalStore } from "react";
import type { Hex } from "viem";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import featureFlags from "@/config/featureFlags";
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
import type { VaultActivity } from "@/types/activity";
import type { CollateralVaultEntry } from "@/types/collateral";
import type { DepositPollingResult } from "@/types/peginPolling";
import type { VaultProvider } from "@/types/vaultProvider";

import {
  getStepLabel,
  getVisualStep,
} from "../simple/DepositProgressView/steps";

/** Whether (and how) a scenario is expected to render the action CTA. */
export type DemoCta = "primary" | "outlined" | "none";

/** The kind of thing a mock item represents. */
export type DemoType = "deposit" | "withdrawal" | "collateral";

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

const EXPIRED_SCENARIOS: DemoScenario[] = [
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
  {
    key: "unowned-disabled",
    label: "Different wallet (disabled)",
    expectedCta: "none",
    contractStatus: ContractStatus.VERIFIED,
    options: {},
    overrides: UNOWNED,
  },
];

/** All deposit states: the flow steps then the expired/edge states. The
 *  contract status of the chosen state decides the section it renders in. */
export const DEPOSIT_SCENARIOS: DemoScenario[] = [
  ...PENDING_FLOW_SCENARIOS,
  ...EXPIRED_SCENARIOS,
];

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

/** Scenario list for a given mock type (drives the panel's state select). */
export function scenariosForType(type: DemoType): BaseScenario[] {
  if (type === "withdrawal") return WITHDRAWAL_SCENARIOS;
  if (type === "collateral") return COLLATERAL_SCENARIOS;
  return DEPOSIT_SCENARIOS;
}

/** Which dashboard section a mock item renders in (panel hint, derived from
 *  type + state). */
export function itemSectionHint(item: DemoItem): string {
  if (item.type === "withdrawal") {
    const scenario = WITHDRAWAL_SCENARIOS[item.stateIndex];
    return scenario?.claimerStatus === ClaimerPegoutStatusValue.PAYOUT_BROADCAST
      ? "Withdrawals"
      : "Pending Withdrawals";
  }
  if (item.type === "collateral") return "BTC Vaults (collateral)";
  const scenario = DEPOSIT_SCENARIOS[item.stateIndex];
  if (scenario?.contractStatus === ContractStatus.EXPIRED) {
    return "Expired Deposits";
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

let storeEnabled = true;
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

/** Reset to a single default deposit item (used by tests). */
export function resetDemoState() {
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
