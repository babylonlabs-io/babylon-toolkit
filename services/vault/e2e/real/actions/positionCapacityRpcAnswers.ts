/**
 * What the position-capacity watch records of the app's own RPC traffic, and what its injection answers
 * (see positionCapacityRpc.ts, which routes the calls here). Kept free of Playwright and the network
 * profile so it can be unit-tested on its own.
 *
 * A deposit asks the depositor's position for room with one `allowedToDeposit(depositor, n, amount)` read
 * on the application, after reading the depositor's registered vaults (`getDepositorVaultIds`), before
 * the registration and again before the Pre-PegIn broadcast. The app's public client folds every read
 * into a Multicall3 `aggregate3` batch (viem's batch scheduler wraps even a lone call), so both arrive as
 * inner calls of one, and are taken apart here.
 *
 * Every event the watch sees gets a number from one shared counter (`seq`), so the verdicts below can
 * ask "did this read come before that prompt" without trusting wall-clock order across callbacks.
 */
import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionResult,
  multicall3Abi,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from "viem";

import { type PositionFullInjection } from "../config";

import {
  CHECK_ALLOWED_SELECTOR,
  decodeCheckAllowedAnswer,
  decodeCheckAllowedCall,
  notAllowListedOutcome,
} from "./allowListRpcAnswers";
import { isRecord } from "./writeRpcAnswers";

export const ALLOWED_TO_DEPOSIT_ABI = parseAbi([
  "function allowedToDeposit(address vaultReceiver, uint256 nVaultsToDeposit, uint256 amountToDeposit) view returns (bool)",
]);
export const GET_DEPOSITOR_VAULT_IDS_ABI = parseAbi([
  "function getDepositorVaultIds(address depositor) view returns (bytes32[] vaultIds)",
]);

const ALLOWED_TO_DEPOSIT_SELECTOR = toFunctionSelector(
  ALLOWED_TO_DEPOSIT_ABI[0],
);
const GET_DEPOSITOR_VAULT_IDS_SELECTOR = toFunctionSelector(
  GET_DEPOSITOR_VAULT_IDS_ABI[0],
);

/** The `allowedToDeposit` question, as the app asked it. */
export interface CapacityArgs {
  nVaults: bigint;
  amount: bigint;
}

/** One `allowedToDeposit` read for the depositor's position. */
export interface CapacityRead extends CapacityArgs {
  seq: number;
  /** What the chain answered, or null when the inner call failed. */
  realAnswer: boolean | null;
  /** What the app was served: the real answer, or `false` under the injection. */
  servedAnswer: boolean | null;
}

/** One depositor allow-list (`checkAllowed`) read for the depositor in the deposit's application. */
export interface AllowListWatchRead {
  seq: number;
  /** What the chain answered, or null when the inner call failed. */
  realAnswer: boolean | null;
  /** What the app was served: the real answer, or `false` under `--inject-not-allow-listed`. */
  servedAnswer: boolean | null;
}

/** What the watch has seen of the app's traffic, and what it is doing to it. */
export interface CapacityRpcState {
  /** All lowercased. */
  depositor: string;
  adapter: string;
  registry: string;
  multicall3: string;
  injection: PositionFullInjection | undefined;
  /** The chain head before the run: a registration receipt from at or below it is an old one. */
  startBlock: bigint;
  /** True while the injection holds; false once released, or with no injection. */
  holding: boolean;
  signClickSeq: number | null;
  retryClickSeq: number | null;
  capacityReads: CapacityRead[];
  vaultIdsReadSeqs: number[];
  /**
   * `--inject-not-allow-listed`: from the Sign click, answer the depositor's allow-list read with
   * "not allowed". Matched by selector, whatever policy address the app resolved.
   */
  notAllowListed: boolean;
  allowListReads: AllowListWatchRead[];
  /** The registration's `eth_estimateGas` (before the MetaMask prompt). */
  registrationPreparedSeq: number | null;
  /** The first successful registration receipt for this run. */
  registrationMined: {
    seq: number;
    txHash: string;
    blockNumber: bigint;
  } | null;
  /** Every Pre-PegIn broadcast POST. */
  broadcastSeqs: number[];
  /** Every extension window that opened. */
  popups: { seq: number; url: string }[];
  /** How many answers the injection changed. */
  tampered: number;
  /**
   * Set when the app prepared its registration without a capacity read since the Sign click. An
   * enforcing watch refuses that estimate, so the registration fails before any MetaMask prompt, and
   * the run fails with this message.
   */
  violation: string | null;
}

export function createCapacityRpcState(params: {
  depositor: string;
  adapter: string;
  registry: string;
  multicall3: string;
  injection: PositionFullInjection | undefined;
  notAllowListed?: boolean;
  startBlock: bigint;
}): CapacityRpcState {
  return {
    depositor: params.depositor.toLowerCase(),
    adapter: params.adapter.toLowerCase(),
    registry: params.registry.toLowerCase(),
    multicall3: params.multicall3.toLowerCase(),
    injection: params.injection,
    startBlock: params.startBlock,
    holding: params.injection !== undefined,
    signClickSeq: null,
    retryClickSeq: null,
    capacityReads: [],
    vaultIdsReadSeqs: [],
    notAllowListed: params.notAllowListed ?? false,
    allowListReads: [],
    registrationPreparedSeq: null,
    registrationMined: null,
    broadcastSeqs: [],
    popups: [],
    tampered: 0,
    violation: null,
  };
}

/** Whether the injection answers the depositor's `allowedToDeposit` with `false` right now. */
export function refuses(state: CapacityRpcState): boolean {
  if (!state.holding || state.signClickSeq === null) return false;
  if (state.injection === "before-registration") return true;
  return (
    state.injection === "before-broadcast" && state.registrationMined !== null
  );
}

/** A cheap pre-filter on a request body, so the route only fetches the calls it may watch. */
export function mayCarryWatchedCall(postData: string): boolean {
  const body = postData.toLowerCase();
  return (
    body.includes(ALLOWED_TO_DEPOSIT_SELECTOR.slice(2)) ||
    body.includes(GET_DEPOSITOR_VAULT_IDS_SELECTOR.slice(2)) ||
    body.includes(CHECK_ALLOWED_SELECTOR.slice(2))
  );
}

interface CallOutcome {
  success: boolean;
  returnData: Hex;
}

/** Record the depositor's allow-list read, and answer "not allowed" under the injection from Sign. */
function answerAllowListCall(
  state: CapacityRpcState,
  seq: number,
  target: string,
  callData: Hex,
  outcome: CallOutcome,
): CallOutcome | null {
  const asked = decodeCheckAllowedCall(target, callData);
  if (!asked) return null;
  if (
    asked.depositor !== state.depositor ||
    asked.appEntryPoint !== state.adapter
  )
    return outcome;
  const realAnswer = decodeCheckAllowedAnswer(outcome);
  // As for capacity, a failed read stays failed: the app fails open on it, which is not a verdict
  // this watch may fake.
  const rewrite =
    outcome.success && state.notAllowListed && state.signClickSeq !== null;
  state.allowListReads.push({
    seq,
    realAnswer,
    servedAnswer: rewrite ? false : realAnswer,
  });
  if (!rewrite) return outcome;
  state.tampered += 1;
  return notAllowListedOutcome();
}

/** Record one call if it is a watched one, and return the outcome the app should see. */
function answerWatchedCall(
  state: CapacityRpcState,
  seq: number,
  target: string,
  callData: Hex,
  outcome: CallOutcome,
): CallOutcome {
  const allowList = answerAllowListCall(state, seq, target, callData, outcome);
  if (allowList) return allowList;

  const to = target.toLowerCase();
  const selector = callData.slice(0, 10).toLowerCase();

  if (to === state.registry && selector === GET_DEPOSITOR_VAULT_IDS_SELECTOR) {
    const { args } = decodeFunctionData({
      abi: GET_DEPOSITOR_VAULT_IDS_ABI,
      data: callData,
    });
    if (args[0].toLowerCase() === state.depositor)
      state.vaultIdsReadSeqs.push(seq);
    return outcome;
  }

  if (to !== state.adapter || selector !== ALLOWED_TO_DEPOSIT_SELECTOR)
    return outcome;
  const { args } = decodeFunctionData({
    abi: ALLOWED_TO_DEPOSIT_ABI,
    data: callData,
  });
  const [receiver, nVaults, amount] = args;
  if (receiver.toLowerCase() !== state.depositor) return outcome;

  const realAnswer = outcome.success
    ? decodeFunctionResult({
        abi: ALLOWED_TO_DEPOSIT_ABI,
        functionName: "allowedToDeposit",
        data: outcome.returnData,
      })
    : null;
  // A failed read stays failed: the app then refuses with "Couldn't check your position", which is a
  // real read failure, not a verdict this watch may fake.
  const rewrite = outcome.success && refuses(state);
  state.capacityReads.push({
    seq,
    nVaults,
    amount,
    realAnswer,
    servedAnswer: rewrite ? false : realAnswer,
  });
  if (!rewrite) return outcome;
  state.tampered += 1;
  return {
    success: true,
    returnData: encodeFunctionResult({
      abi: ALLOWED_TO_DEPOSIT_ABI,
      functionName: "allowedToDeposit",
      result: false,
    }),
  };
}

/**
 * The `eth_call` result the app should get for `call`, given the RPC's real `result`. Records every
 * watched call, and under the injection rewrites the depositor's `allowedToDeposit` answer. A batch it
 * cannot take apart is passed through untouched.
 */
export function answerEthCall(
  state: CapacityRpcState,
  seq: number,
  call: unknown,
  result: Hex,
): Hex {
  if (!isRecord(call) || typeof call.to !== "string") return result;
  const data = (call.data ?? call.input) as Hex | undefined;
  if (typeof data !== "string") return result;

  if (call.to.toLowerCase() !== state.multicall3) {
    const answered = answerWatchedCall(state, seq, call.to, data, {
      success: true,
      returnData: result,
    });
    return answered.returnData;
  }

  let calls: readonly { target: string; callData: Hex }[];
  let outcomes: readonly CallOutcome[];
  try {
    [calls] = decodeFunctionData({ abi: multicall3Abi, data })
      .args as unknown as [{ target: string; callData: Hex }[]];
    outcomes = decodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      data: result,
    }) as unknown as CallOutcome[];
  } catch {
    return result;
  }
  if (outcomes.length !== calls.length) return result;

  let changed = false;
  const answered = calls.map((inner, index) => {
    const outcome = outcomes[index];
    const next = answerWatchedCall(
      state,
      seq,
      inner.target,
      inner.callData,
      outcome,
    );
    if (next !== outcome) changed = true;
    return next;
  });
  if (!changed) return result;
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    result: answered,
  });
}

/**
 * Note an `eth_estimateGas`. The first one for the depositor's call to the registry is the registration
 * being prepared, before its MetaMask prompt. Returns false when that estimate comes with no capacity
 * read since the Sign click: an enforcing caller refuses it, so nothing is sent.
 */
export function noteEstimateGas(
  state: CapacityRpcState,
  seq: number,
  params: readonly unknown[],
): boolean {
  const [request] = params;
  if (
    state.registrationPreparedSeq !== null ||
    state.signClickSeq === null ||
    !isRecord(request) ||
    typeof request.to !== "string" ||
    typeof request.from !== "string" ||
    request.to.toLowerCase() !== state.registry ||
    request.from.toLowerCase() !== state.depositor
  )
    return true;
  state.registrationPreparedSeq = seq;
  const signClickSeq = state.signClickSeq;
  const checked = state.capacityReads.some((read) => read.seq > signClickSeq);
  if (!checked)
    state.violation =
      "The app prepared the Ethereum registration without asking the application allowedToDeposit since Sign was clicked — the capacity check before registration is missing (or the dev server is not running this branch).";
  return checked;
}

/**
 * Note a receipt. The first successful one for the depositor's call to the registry, mined after the run
 * started, is the registration. Returns it when this receipt is the one, else null.
 */
export function noteReceipt(
  state: CapacityRpcState,
  seq: number,
  result: unknown,
): CapacityRpcState["registrationMined"] {
  if (state.registrationMined !== null || !isRecord(result)) return null;
  const { to, from, status, blockNumber, transactionHash } = result;
  if (
    typeof to !== "string" ||
    typeof from !== "string" ||
    typeof blockNumber !== "string" ||
    typeof transactionHash !== "string" ||
    to.toLowerCase() !== state.registry ||
    from.toLowerCase() !== state.depositor ||
    status !== "0x1"
  )
    return null;
  const minedIn = BigInt(blockNumber);
  if (minedIn <= state.startBlock) return null;
  state.registrationMined = {
    seq,
    txHash: transactionHash,
    blockNumber: minedIn,
  };
  return state.registrationMined;
}

/** The `allowedToDeposit` question a deposit of `batch` asks, with `inFlight` other vaults counted. */
export function expectedCapacityArgs(
  batch: { count: number; sats: bigint },
  inFlight: { count: number; sats: bigint },
): CapacityArgs {
  return {
    nVaults: BigInt(batch.count + inFlight.count),
    amount: batch.sats + inFlight.sats,
  };
}

export function describeRead(read: CapacityArgs): string {
  return `allowedToDeposit(n=${read.nVaults}, amount=${read.amount} sats)`;
}

/** Whether `read` asked one of the `expected` questions. */
export function matchesAny(
  read: CapacityArgs,
  expected: readonly CapacityArgs[],
): boolean {
  return expected.some(
    (args) => args.nVaults === read.nVaults && args.amount === read.amount,
  );
}

export function describeExpected(expected: readonly CapacityArgs[]): string {
  return expected.map(describeRead).join(" or ");
}

/**
 * Require a truthful capacity read the app was told "yes" in `(after, before)`, asking one of
 * `expected`, with a fresh `getDepositorVaultIds` read between `after` and it. Returns that read.
 */
function requireCheck(
  state: CapacityRpcState,
  label: string,
  after: number,
  before: number,
  expected: readonly CapacityArgs[],
): CapacityRead {
  const inWindow = state.capacityReads.filter(
    (read) => read.seq > after && read.seq < before,
  );
  if (inWindow.length === 0)
    throw new Error(
      `${label}: the app never asked the application allowedToDeposit for the depositor's position in that window. Expected ${describeExpected(expected)}.`,
    );
  const asked = inWindow.find(
    (read) => read.servedAnswer === true && matchesAny(read, expected),
  );
  if (!asked)
    throw new Error(
      `${label}: the app asked ${inWindow.map((read) => `${describeRead(read)} → ${read.servedAnswer}`).join(", ")}, expected ${describeExpected(expected)} answered true. A different n or amount means the deposit or the depositor's other unactivated vaults were counted wrong.`,
    );
  const vaultListRead = state.vaultIdsReadSeqs.some(
    (seq) => seq > after && seq < asked.seq,
  );
  if (!vaultListRead)
    throw new Error(
      `${label}: the app asked ${describeRead(asked)} without reading the depositor's registered vaults (getDepositorVaultIds) first, so its in-flight count did not come from chain.`,
    );
  return asked;
}

/**
 * The happy-path check before registration: after the Sign click and before the registration was
 * prepared (or mined, for a wallet that skips the estimate).
 */
export function assertCheckedBeforeRegistration(
  state: CapacityRpcState,
  expected: readonly CapacityArgs[],
): CapacityRead {
  if (state.signClickSeq === null)
    throw new Error("The watch never saw the Sign click.");
  const before =
    state.registrationPreparedSeq ??
    state.registrationMined?.seq ??
    Number.POSITIVE_INFINITY;
  return requireCheck(
    state,
    "Before registration",
    state.signClickSeq,
    before,
    expected,
  );
}

/**
 * The check before a broadcast: after `after` (the registration receipt, or a Retry click) and before
 * the first Pre-PegIn broadcast that follows it.
 */
export function assertCheckedBeforeBroadcast(
  state: CapacityRpcState,
  label: string,
  after: number,
  expected: readonly CapacityArgs[],
): CapacityRead {
  const broadcast = state.broadcastSeqs.find((seq) => seq > after);
  if (broadcast === undefined)
    throw new Error(
      `${label}: the watch saw no Pre-PegIn broadcast after that point, so the order of check and broadcast cannot be judged.`,
    );
  return requireCheck(state, label, after, broadcast, expected);
}

/** The refusal before registration: injected, about the right question, and nothing prompted or sent. */
export function assertRefusedBeforeRegistration(
  state: CapacityRpcState,
  expected: readonly CapacityArgs[],
): CapacityRead {
  const signClickSeq = state.signClickSeq;
  if (signClickSeq === null)
    throw new Error("The watch never saw the Sign click.");
  const afterSign = state.capacityReads.filter(
    (read) => read.seq > signClickSeq,
  );
  // Checked first: the injection only rewrites a successful answer, so a read the chain itself refused
  // reaches the app as "no" without counting as injected, and a failed one reaches it as failed.
  const realRefusal = afterSign.find((read) => read.realAnswer !== true);
  if (realRefusal)
    throw new Error(
      `The chain itself answered ${describeRead(realRefusal)} with ${realRefusal.realAnswer}: the position has no room (or the read failed), so the refusal did not come from the injection. Free a slot or use another account.`,
    );
  const tampered = afterSign.filter(
    (read) => read.servedAnswer !== read.realAnswer,
  );
  if (tampered.length === 0)
    throw new Error(
      "The injection never answered an allowedToDeposit read after Sign, so this run tested nothing: the app did not ask the application for room before registering.",
    );
  const [first] = tampered;
  if (!matchesAny(first, expected))
    throw new Error(
      `The app asked ${describeRead(first)}, expected ${describeExpected(expected)}.`,
    );
  if (
    !state.vaultIdsReadSeqs.some((seq) => seq > signClickSeq && seq < first.seq)
  )
    throw new Error(
      `The app asked ${describeRead(first)} without reading the depositor's registered vaults (getDepositorVaultIds) first.`,
    );
  const prompts = state.popups.filter((popup) => popup.seq > signClickSeq);
  if (prompts.length > 0)
    throw new Error(
      `A wallet window opened after Sign although the deposit was refused before any signing prompt (with UniSat unlocked none may open): ${prompts.map((popup) => popup.url).join(", ")}.`,
    );
  if (state.registrationPreparedSeq !== null)
    throw new Error(
      "The app prepared the Ethereum registration although the position-capacity check refused the deposit.",
    );
  if (state.broadcastSeqs.length > 0)
    throw new Error("A Pre-PegIn broadcast was sent for a refused deposit.");
  return first;
}

/**
 * The allow-list refusal (`--inject-not-allow-listed`): the app asked the allow-list after Sign, before
 * the position's capacity, was told "not allowed" by the injection, and prompted, prepared and sent
 * nothing.
 */
export function assertRefusedNotAllowListed(
  state: CapacityRpcState,
): AllowListWatchRead {
  const signClickSeq = state.signClickSeq;
  if (signClickSeq === null)
    throw new Error("The watch never saw the Sign click.");
  const afterSign = state.allowListReads.filter(
    (read) => read.seq > signClickSeq,
  );
  // Checked first: a "no" from the chain itself is not the injection's. Unlike capacity, a failed read
  // is not a refusal at all — the app fails open on it — so it cannot have stopped the deposit and is
  // left out here; the injected read below is what must have.
  const realRefusal = afterSign.find((read) => read.realAnswer === false);
  if (realRefusal)
    throw new Error(
      "The chain itself answered the depositor's allow-list read with false, so the refusal did not come from the injection. Run it where the gate is removed (devnet) or with an allow-listed account.",
    );
  const tampered = afterSign.filter(
    (read) => read.servedAnswer !== read.realAnswer,
  );
  if (tampered.length === 0)
    throw new Error(
      "The injection never answered an allow-list read after Sign, so this run tested nothing: the app did not check the allow-list before its first signing prompt.",
    );
  const [first] = tampered;
  const capacityAfterSign = state.capacityReads.filter(
    (read) => read.seq > signClickSeq,
  );
  if (capacityAfterSign.length > 0)
    throw new Error(
      `The app asked the position for room (${describeRead(capacityAfterSign[0])}) although the allow-list already refused the deposit, which the registry checks first.`,
    );
  const prompts = state.popups.filter((popup) => popup.seq > signClickSeq);
  if (prompts.length > 0)
    throw new Error(
      `A wallet window opened after Sign although the deposit was refused before any signing prompt (with UniSat unlocked none may open): ${prompts.map((popup) => popup.url).join(", ")}.`,
    );
  if (state.registrationPreparedSeq !== null)
    throw new Error(
      "The app prepared the Ethereum registration although the allow-list refused the deposit.",
    );
  if (state.broadcastSeqs.length > 0)
    throw new Error("A Pre-PegIn broadcast was sent for a refused deposit.");
  return first;
}
