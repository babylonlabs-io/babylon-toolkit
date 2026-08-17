import type { ProtocolStatus } from "@/components/shared/protocolStatus";

import { createOverrideStore } from "./store";

const maxVaultsOverrideStore = createOverrideStore<number>();
const protocolStatusOverrideStore = createOverrideStore<ProtocolStatus>();

/** Force (a cap number) or release (null) the "maximum vaults reached" card. */
export const useMaxVaultsOverride = maxVaultsOverrideStore.useValue;
export const setMaxVaultsOverride = maxVaultsOverrideStore.set;

/** Force (a status) or release (null) the protocol soft/fully-paused banner. */
export const useProtocolStatusOverride = protocolStatusOverrideStore.useValue;
export const setProtocolStatusOverride = protocolStatusOverrideStore.set;
