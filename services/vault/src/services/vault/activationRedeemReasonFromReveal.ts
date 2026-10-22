/**
 * The redeem reason for a normal activation the registry returned, read from
 * the reveal's receipt. Runs on the activation success path, so it never throws.
 */

import type { Hex, TransactionReceipt } from "viem";

import { logger } from "@/infrastructure";

import {
  classifyActivationRedeem,
  isCapInferenceAllowed,
  type ActivationRedeemReason,
} from "./activationRedeemReason";

export function activationRedeemReasonFromReveal({
  receipt,
  vaultId,
  minActivationGasAtSend,
  applicationEntryPoint,
}: {
  receipt: TransactionReceipt;
  vaultId: Hex;
  /** The registry's activation gas gate read before sending; null when it had none. */
  minActivationGasAtSend: bigint | null;
  applicationEntryPoint: string | undefined;
}): ActivationRedeemReason {
  try {
    return (
      classifyActivationRedeem({
        logs: receipt.logs,
        vaultId,
        gatePresentAtReceipt: minActivationGasAtSend !== null,
        capInferenceAllowed: isCapInferenceAllowed(applicationEntryPoint),
      }) ?? { kind: "unknown" }
    );
  } catch {
    try {
      // Only the vault id: the receipt carries the revealed secret.
      logger.warn("Could not read the activation redeem reason", {
        category: "activation",
        vaultId,
      });
    } catch {
      // The helper must never throw past a landed reveal.
    }
    return { kind: "unknown" };
  }
}
