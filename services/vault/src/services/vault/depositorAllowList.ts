/**
 * Depositor allow-list check before a new deposit's first signing prompt, again
 * after an ETH top-up wait, and before each of its registration attempts.
 *
 * The registry refuses an unlisted depositor's registration with
 * `DepositNotAllowed()`
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/lib/PeginLogic.sol:269-272).
 * Without this check the depositor learns that only at the registration's gas
 * estimate, after the vault-secret derivation, PegIn and proof-of-possession
 * prompts. The deposit form reads the same view, but its answer can be up to a
 * minute old and can still be loading when the depositor clicks.
 *
 * Fails open, unlike the position-capacity check: the registry is the control,
 * and it refuses before anything is broadcast or any ETH is spent, so an
 * unreadable list costs the depositor those prompts and nothing else. Blocking
 * instead would stop every deposit while the app RPC cannot answer, including
 * on networks whose gate is removed. The failure is reported, not swallowed.
 *
 * Resumed deposits never reach this: their registration has already passed
 * the gate, and the registry does not check it again.
 *
 * Import this by its own path, never through the `@/services/vault` barrel:
 * that barrel is factory-mocked with a fixed export list in the deposit hook
 * tests.
 */

import { DepositNotAllowedError } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address } from "viem";

import { readDepositorAllowed } from "@/clients/eth-contract/allow-list-policy";
import { logger } from "@/infrastructure";
import { TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";

export interface AssertDepositorAllowListedParams {
  /** The application the deposit's vault provider is registered to. */
  applicationEntryPoint: Address;
  /** The Ethereum account that will send the registration. */
  depositor: Address;
}

/**
 * Throws `DepositNotAllowedError` when the chain says the registry would
 * refuse `depositor`. The same typed error the SDK raises for the registry's
 * revert, so both paths reach the depositor as one message.
 */
export async function assertDepositorAllowListed(
  params: AssertDepositorAllowListedParams,
): Promise<void> {
  let allowed: boolean;
  try {
    allowed = await readDepositorAllowed(params);
  } catch (err) {
    logger.event(TELEMETRY_EVENT.DEPOSIT_ALLOW_LIST_UNREADABLE, {
      level: "warning",
      category: "deposit",
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!allowed) {
    throw new DepositNotAllowedError(
      "The depositor is not on the application's allow-list, so the registry " +
        "would refuse the registration. Refused before registration.",
    );
  }
}
