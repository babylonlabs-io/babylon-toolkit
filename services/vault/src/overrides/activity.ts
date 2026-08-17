import type { ActivityRow } from "@/types/activityLog";

import { createOverrideStore } from "./store";

export interface ActivityOverride {
  rows: ActivityRow[];
  hideReal: boolean;
}

const activityOverrideStore = createOverrideStore<ActivityOverride>();

export const useActivityOverride = activityOverrideStore.useValue;
export const setActivityOverride = activityOverrideStore.set;
