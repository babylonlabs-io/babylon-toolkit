/**
 * Per-scope on-chain pause/freeze detection.
 *
 * Reads `pauseState()` from the two governance scopes:
 * - protocol scope: `BTCVaultRegistry` (uses a self-contained ABI fragment —
 *   the bundled registry ABI in `@babylonlabs-io/ts-sdk/tbv/core` is the
 *   signing subset and does not expose this getter).
 * - aave scope: `AaveIntegrationAdapter` (the SDK ABI already exposes it).
 *
 * Both return the on-chain `ITBVPausable.PauseState` enum (a `uint8`).
 */

import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import type {
  ProtocolGateState,
  ScopeStatus,
} from "@/components/shared/protocolStatus";
import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

/** Single-function ABI for `BTCVaultRegistry.pauseState()`. */
const REGISTRY_PAUSE_STATE_ABI = [
  {
    type: "function",
    name: "pauseState",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// VALUE-CRITICAL: this uint8 -> status mapping gates the exit path, so a wrong
// ordering would mis-gate (e.g. leave exits open during a real pause).
// Confirmed against the upstream Solidity `ITBVPausable.sol`:
//   enum PauseState { None, Frozen, Paused }  // 0, 1, 2
// (`freeze() -> Frozen`, `pause() -> Paused`; both contracts the FE reads
// inherit `TBVPausableUpg`).
const PAUSE_STATE = {
  /** Normal operation. */
  NONE: 0,
  /** Frozen — blocks new entry, preserves exits. */
  FROZEN: 1,
  /** Fully paused — full stop. */
  PAUSED: 2,
} as const;

// An unrecognized enum value means the on-chain contract is in a state this
// build does not model (e.g. a future `PauseState` was added). Treat it as the
// MOST RESTRICTIVE status ("paused") — fail CLOSED — rather than mapping it to
// `null`, which would leave actions open during a state we don't understand.
// This is deliberately different from a genuine read failure (a reverted
// multicall throws and the React-Query hook fails OPEN, so an RPC blip never
// traps a user mid-exit).
function mapPauseState(raw: number): ScopeStatus {
  switch (raw) {
    case PAUSE_STATE.NONE:
      return null;
    case PAUSE_STATE.FROZEN:
      return "frozen";
    case PAUSE_STATE.PAUSED:
      return "paused";
    default:
      return "paused";
  }
}

/**
 * Read both scopes' pause state in a single multicall round-trip. Throws on a
 * reverted read (the React-Query hook then fails OPEN, deferring to the
 * operator-flag override so an RPC blip never traps a user mid-exit). An
 * unrecognized enum value does NOT throw — it maps to "paused" (fail closed),
 * see `mapPauseState`.
 */
export async function getOnChainPauseState(): Promise<ProtocolGateState> {
  const publicClient = ethClient.getPublicClient();

  const [protocolRaw, aaveRaw] = (await publicClient.multicall({
    contracts: [
      {
        address: CONTRACTS.BTC_VAULT_REGISTRY,
        abi: REGISTRY_PAUSE_STATE_ABI,
        functionName: "pauseState",
      },
      {
        address: CONTRACTS.AAVE_ADAPTER,
        abi: AaveIntegrationAdapterABI,
        functionName: "pauseState",
        args: [],
      },
    ],
    allowFailure: false,
  })) as [number, number];

  return {
    protocol: mapPauseState(Number(protocolRaw)),
    aave: mapPauseState(Number(aaveRaw)),
  };
}
