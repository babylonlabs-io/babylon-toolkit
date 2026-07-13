/**
 * Registry of implemented actions: connect, observe, wallet-config, pegin, sign-conformance, and
 * borrow. The remaining actions (repay/withdraw) are declared disabled in `config.ts` for the CLI's
 * roadmap display and register here as they land.
 */
import type { ActionId } from "../config";

import { borrowAction } from "./borrow";
import { connectAction } from "./connect";
import { observeAction } from "./observe";
import { peginAction } from "./pegin";
import { signConformanceAction } from "./signConformance";
import type { Action } from "./types";
import { walletConfigAction } from "./walletConfig";

export const ACTIONS_BY_ID: Partial<Record<ActionId, Action>> = {
  connect: connectAction,
  observe: observeAction,
  "wallet-config": walletConfigAction,
  pegin: peginAction,
  "sign-conformance": signConformanceAction,
  borrow: borrowAction,
};
