// The indexer's stored activation redeem reason, mapped onto `ActivationRedeemReason`
// with the live classifier's revert-data rule, so live and reloaded reads agree.

import { isHex } from "viem";

import { logger } from "@/infrastructure";

import {
  activationFailedReasonFromData,
  type ActivationRedeemReason,
} from "./activationRedeemReason";

/** Why the registry handed the vault back at activation; undefined when it did not, or when the value is unknown to this build. */
export function redeemReasonFromIndexer(
  reason: string | null,
  failedData: string | null,
): ActivationRedeemReason | undefined {
  switch (reason) {
    case null:
      return undefined;
    case "cap_exceeded":
    case "depositor_redeemed":
    case "unknown":
      return { kind: reason };
    case "app_reverted":
      // viem's strict isHex accepts the empty "0x" payload, which is the out-of-gas case.
      return isHex(failedData)
        ? activationFailedReasonFromData(failedData)
        : { kind: "unknown" };
    default:
      logger.warn(`Unknown indexer activation redeem reason "${reason}"`, {
        category: "activation",
      });
      return undefined;
  }
}
