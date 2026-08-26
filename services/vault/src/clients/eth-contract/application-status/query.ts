/**
 * Per-vault application-registration status.
 *
 * The registry requires the vault's application to be registered AND Active
 * for BOTH activation paths — including `activateVaultWithSecretAndRedeem`,
 * which otherwise never touches the application adapter (`RedeemLogic.sol`
 * checks `getApplicationStatus(vBasic.applicationEntryPoint) == Active` and
 * reverts `ApplicationNotActive`). Reading it lets the escape-hatch CTA stop
 * offering an action that cannot succeed, instead of surfacing the revert only
 * after the user has committed to revealing the secret.
 *
 * Two chained reads: the vault's `applicationEntryPoint` and the registry's
 * `applicationRegistry` address come from one multicall, then the status is
 * read from that registry. Same shape as the `pause-state` sibling, including
 * the self-contained ABI fragment — the bundled ApplicationRegistry ABI in
 * `@babylonlabs-io/ts-sdk` is the keeper-reading subset and does not expose
 * this getter.
 */

import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

/** Single-function ABI for `ApplicationRegistry.getApplicationStatus(address)`. */
const APPLICATION_STATUS_ABI = [
  {
    type: "function",
    name: "getApplicationStatus",
    stateMutability: "view",
    inputs: [{ name: "appEntryPoint", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// VALUE-CRITICAL: this uint8 -> status mapping gates the escape hatch, whose
// action reveals the HTLC secret. Confirmed against the upstream Solidity
// `IApplicationRegistry.sol`:
//   enum ApplicationStatus { None, Active, Paused }  // 0, 1, 2
// (None = never registered; Paused = all lifecycle operations blocked.)
const APPLICATION_STATUS = {
  /** Not registered — the redeem path reverts `ApplicationNotActive`. */
  NONE: 0,
  /** Registered and usable. */
  ACTIVE: 1,
  /** Registered but paused — lifecycle operations blocked. */
  PAUSED: 2,
} as const;

/**
 * Whether the vault's application is Active on chain.
 *
 * `true` only for a confirmed Active reading. An unrecognized enum value is
 * reported as NOT active: a state this build does not model must not unlock a
 * secret-revealing action. A failed READ throws instead — the consuming hook
 * fails open there, because an RPC blip must never strand a depositor whose
 * only remaining recovery is this hatch, and the mandatory pre-broadcast
 * simulation still refuses to sign into a genuinely inactive application.
 */
export async function isVaultApplicationActive(vaultId: Hex): Promise<boolean> {
  const publicClient = ethClient.getPublicClient();

  const [basicInfo, applicationRegistry] = (await publicClient.multicall({
    contracts: [
      {
        address: CONTRACTS.BTC_VAULT_REGISTRY,
        abi: BTCVaultRegistryABI,
        functionName: "getBtcVaultBasicInfo",
        args: [vaultId],
      },
      {
        address: CONTRACTS.BTC_VAULT_REGISTRY,
        abi: BTCVaultRegistryABI,
        functionName: "applicationRegistry",
      },
    ],
    allowFailure: false,
  })) as [{ applicationEntryPoint: Address }, Address];

  const status = (await publicClient.readContract({
    address: applicationRegistry,
    abi: APPLICATION_STATUS_ABI,
    functionName: "getApplicationStatus",
    args: [basicInfo.applicationEntryPoint],
  })) as number;

  return Number(status) === APPLICATION_STATUS.ACTIVE;
}
