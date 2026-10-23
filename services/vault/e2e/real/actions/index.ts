/**
 * Registry of implemented actions: connect, observe, wallet-config, pegin, sign-conformance, borrow,
 * repay, multi-hub, repay-all, withdraw, resume, recover, reclaim, forged-stuck, and allow-list.
 */
import type { ActionId } from "../config";

import { allowListAction } from "./allowList";
import { borrowAction } from "./borrow";
import { connectAction } from "./connect";
import { forgedStuckAction } from "./forgedStuck";
import { multiHubAction } from "./multiHub";
import { observeAction } from "./observe";
import { peginAction } from "./pegin";
import { reclaimAction } from "./reclaim";
import { recoverAction } from "./recover";
import { repayAction } from "./repay";
import { repayAllAction } from "./repayAll";
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
  "multi-hub": multiHubAction,
  "repay-all": repayAllAction,
  withdraw: withdrawAction,
  resume: resumeAction,
  recover: recoverAction,
  reclaim: reclaimAction,
  "forged-stuck": forgedStuckAction,
  "allow-list": allowListAction,
};
