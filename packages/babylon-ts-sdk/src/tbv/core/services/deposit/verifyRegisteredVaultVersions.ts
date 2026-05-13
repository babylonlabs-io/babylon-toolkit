import type { Hex } from "viem";

import type { VaultRegistryReader } from "../../clients/eth/types";

export interface VerifyRegisteredVaultVersionsParams {
  vaultRegistryReader: VaultRegistryReader;
  vaultIds: readonly Hex[];
  expectedOffchainParamsVersion: number;
  expectedAppVaultKeepersVersion: number;
  expectedUniversalChallengersVersion: number;
}

// Distinct from a transient RPC failure: the orchestrator removes pending
// pegin entries only when a real mismatch is confirmed on-chain.
export class RegisteredVaultVersionMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisteredVaultVersionMismatchError";
  }
}

// `instanceof` alone fails across module boundaries (duplicate SDK copies,
// test mocks). Fall back to the name field so the cleanup path stays reliable.
export function isRegisteredVaultVersionMismatchError(
  err: unknown,
): err is RegisteredVaultVersionMismatchError {
  return (
    err instanceof RegisteredVaultVersionMismatchError ||
    (err instanceof Error && err.name === "RegisteredVaultVersionMismatchError")
  );
}

export async function verifyRegisteredVaultVersions(
  params: VerifyRegisteredVaultVersionsParams,
): Promise<void> {
  const {
    vaultRegistryReader,
    vaultIds,
    expectedOffchainParamsVersion,
    expectedAppVaultKeepersVersion,
    expectedUniversalChallengersVersion,
  } = params;

  const infos = await vaultRegistryReader.getProtocolInfoBatch(vaultIds);

  const mismatches: string[] = [];
  infos.forEach((v, i) => {
    const id = vaultIds[i];
    if (v.offchainParamsVersion !== expectedOffchainParamsVersion) {
      mismatches.push(
        `vault ${id}: offchainParams expected v${expectedOffchainParamsVersion}, got v${v.offchainParamsVersion}`,
      );
    }
    if (v.appVaultKeepersVersion !== expectedAppVaultKeepersVersion) {
      mismatches.push(
        `vault ${id}: appVaultKeepers expected v${expectedAppVaultKeepersVersion}, got v${v.appVaultKeepersVersion}`,
      );
    }
    if (v.universalChallengersVersion !== expectedUniversalChallengersVersion) {
      mismatches.push(
        `vault ${id}: universalChallengers expected v${expectedUniversalChallengersVersion}, got v${v.universalChallengersVersion}`,
      );
    }
  });

  if (mismatches.length > 0) {
    throw new RegisteredVaultVersionMismatchError(
      `Aborting BTC broadcast: signer-set or offchain-params versions changed during registration (${mismatches.join("; ")}). The Pre-PegIn was not broadcast; the registered ETH vault will time out per protocol rules.`,
    );
  }
}
