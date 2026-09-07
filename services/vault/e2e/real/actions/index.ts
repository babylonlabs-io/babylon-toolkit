/**
 * Registry of implemented actions: connect, observe, wallet-config, pegin, sign-conformance, borrow,
 * repay, withdraw, resume, recover, and reclaim.
 */
import type { ActionId } from "../config";

import { borrowAction } from "./borrow";
import { connectAction } from "./connect";
import { observeAction } from "./observe";
import { peginAction } from "./pegin";
import { reclaimAction } from "./reclaim";
import { recoverAction } from "./recover";
import { repayAction } from "./repay";
import { resumeAction } from "./resume";
import { signConformanceAction } from "./signConformance";
import type { Action } from "./types";
import { walletConfigAction } from "./walletConfig";
import { withdrawAction } from "./withdraw";

export const ACTIONS_BY_ID: Partial<Record<ActionId, Action>> = {
  connect: connectAction,
  observe: observeAction,
  "wallet-config": walletConfigAction,
  pegin: peginAction,
  "sign-conformance": signConformanceAction,
  borrow: borrowAction,
  repay: repayAction,
  withdraw: withdrawAction,
  resume: resumeAction,
  recover: recoverAction,
  reclaim: reclaimAction,
};
