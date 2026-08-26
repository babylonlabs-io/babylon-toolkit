/**
 * Pure transformation functions for deposit data
 * Convert between different data formats without side effects
 */

import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";

import { parseBtcToSatoshis } from "../../utils/btcConversion";

// Re-export BTC conversion utilities for convenience
// These are now maintained in the utils directory
export { formatSatoshisToBtc, parseBtcToSatoshis };
