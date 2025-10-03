import { createNanoEvents } from "nanoevents";

export interface UIEventBusEvents {
  /**
   * Event to prefill amount in the staking form
   * @param amount - The amount to prefill
   */
  "form:prefillAmount": (amount: number) => void;
}

const uiEventBus = createNanoEvents<UIEventBusEvents>();

export function useUIEventBus() {
  return uiEventBus;
}
