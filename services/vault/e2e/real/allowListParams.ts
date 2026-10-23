/**
 * The CLI's own on-chain view of the depositor allow-list: the policy the registry names, whether the
 * application's gate is removed, and the policy's answer for the depositor — read independently of the
 * app, so a run can say what the deposit form should show before it looks.
 *
 * The registry refuses a registration with `DepositNotAllowed()` when
 * `checkAllowed(applicationEntryPoint, depositor)` is false
 * (vault-contracts-aave-v4@99a4e3e7:src/protocol/lib/PeginLogic.sol:269-272), with the application
 * entry point taken from the chosen vault provider; the dApp's providers all belong to the profile's
 * Aave adapter, so that is the application asked about here.
 */
import { parseAbi, type Address } from "viem";

import { CHECK_ALLOWED_ABI } from "./actions/allowListRpcAnswers";
import { type NetworkName } from "./config";
import { createEthClient, resolveNetworkContracts } from "./networkContracts";

const REGISTRY_ALLOW_LIST_POLICY_ABI = parseAbi([
  "function allowListPolicy() view returns (address)",
]);
const GATE_REMOVED_ABI = parseAbi([
  "function isApplicationAllowListDisabled(address appEntryPoint) view returns (bool)",
]);

export interface AllowListVerdict {
  /** All lowercased. */
  policy: string;
  appEntryPoint: string;
  depositor: string;
  /** True when the admin removed the application's gate, so every depositor passes. */
  gateRemoved: boolean;
  /** The policy's `checkAllowed` answer: what the registry would do with this depositor's deposit. */
  allowed: boolean;
}

export async function readAllowListVerdict(
  network: NetworkName,
  depositor: string,
): Promise<AllowListVerdict> {
  const { registry, appController, ethRpcUrl } =
    resolveNetworkContracts(network);
  const client = createEthClient(ethRpcUrl);
  const appEntryPoint = appController as Address;

  const policy = await client.readContract({
    address: registry,
    abi: REGISTRY_ALLOW_LIST_POLICY_ABI,
    functionName: "allowListPolicy",
  });
  const [gateRemoved, allowed] = await Promise.all([
    client.readContract({
      address: policy,
      abi: GATE_REMOVED_ABI,
      functionName: "isApplicationAllowListDisabled",
      args: [appEntryPoint],
    }),
    client.readContract({
      address: policy,
      abi: CHECK_ALLOWED_ABI,
      functionName: "checkAllowed",
      args: [appEntryPoint, depositor as Address],
    }),
  ]);

  return {
    policy: policy.toLowerCase(),
    appEntryPoint: appEntryPoint.toLowerCase(),
    depositor: depositor.toLowerCase(),
    gateRemoved,
    allowed,
  };
}
