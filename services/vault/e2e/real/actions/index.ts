/**
 * Registry of implemented actions: connect, connect-eth-only, btc-just-in-time, observe,
 * wallet-config, pegin, sign-conformance, borrow, repay, withdraw, and resume.
 */
import type { ActionId } from "../config";

import { borrowAction } from "./borrow";
import { btcJustInTimeAction } from "./btcJustInTime";
import { connectAction } from "./connect";
import { connectEthOnlyAction } from "./connectEthOnly";
import { observeAction } from "./observe";
import { peginAction } from "./pegin";
import { repayAction } from "./repay";
import { resumeAction } from "./resume";
import { signConformanceAction } from "./signConformance";
import type { Action } from "./types";
import { walletConfigAction } from "./walletConfig";
import { withdrawAction } from "./withdraw";

export const ACTIONS_BY_ID: Partial<Record<ActionId, Action>> = {
  connect: connectAction,
  "connect-eth-only": connectEthOnlyAction,
  "btc-just-in-time": btcJustInTimeAction,
  observe: observeAction,
  "wallet-config": walletConfigAction,
  pegin: peginAction,
  "sign-conformance": signConformanceAction,
  borrow: borrowAction,
  repay: repayAction,
  withdraw: withdrawAction,
  resume: resumeAction,
};
