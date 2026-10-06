import { COPY } from "@/copy";

import { ETH_SLOT_SECONDS } from "./activationDeadline";

const SECONDS_PER_HOUR = 60 * 60;
const HOURS_PER_DAY = 24;

/**
 * Approximate time left in an expired BTCVault's grace window, for display.
 *
 * Blocks are converted at the Ethereum slot time and rounded DOWN at each
 * unit. Missed slots only stretch the real interval, so this never overstates
 * how long the depositor has — the safe direction for a deadline. The contract
 * compares block numbers; this text is never a gate.
 */
export function formatClaimWindowRemaining(blocksRemaining: number): string {
  const hours = Math.floor(
    (Math.max(0, blocksRemaining) * ETH_SLOT_SECONDS) / SECONDS_PER_HOUR,
  );
  if (hours < 1) return COPY.pegin.messages.claimWindowRemaining.underAnHour;
  if (hours < HOURS_PER_DAY) {
    return COPY.pegin.messages.claimWindowRemaining.hours(hours);
  }
  return COPY.pegin.messages.claimWindowRemaining.days(
    Math.floor(hours / HOURS_PER_DAY),
  );
}
