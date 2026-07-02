/**
 * Registry of implemented actions. Only `connect` runs today; the others are declared (disabled) in
 * `config.ts` for the CLI's roadmap display and will register here as they land.
 */
import type { ActionId } from "../config";
import { connectAction } from "./connect";
import type { Action } from "./types";

export const ACTIONS_BY_ID: Partial<Record<ActionId, Action>> = {
  connect: connectAction,
};
