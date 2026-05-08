/**
 * Protocol Parameters Query Client
 *
 * Thin app-side wrappers around the SDK's `ViemProtocolParamsReader`
 * that preserve vault's existing function names and re-exported types.
 * The reader handles validation automatically on every read.
 */

import type {
  AllOffchainParamsData,
  PegInConfiguration,
  TBVProtocolParams,
  VersionedOffchainParams,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { logger } from "@/infrastructure";

import { getProtocolParamsReader } from "../sdk-readers";

export type {
  AllOffchainParamsData,
  PegInConfiguration,
  TBVProtocolParams,
  VersionedOffchainParams,
};

/** Get all TBV protocol parameters from the ProtocolParams contract. */
export async function getTBVProtocolParams(): Promise<TBVProtocolParams> {
  const reader = await getProtocolParamsReader();
  return reader.getTBVProtocolParams();
}

/**
 * Get the latest versioned offchain parameters from the ProtocolParams contract.
 * These include timelocks, fee rates, and output values used for transaction construction.
 */
export async function getLatestOffchainParams(): Promise<VersionedOffchainParams> {
  const reader = await getProtocolParamsReader();
  return reader.getLatestOffchainParams();
}

/**
 * Get peg-in configuration from the ProtocolParams contract.
 * Reads TBV params + offchain params + version atomically via multicall.
 */
export async function getPegInConfiguration(): Promise<PegInConfiguration> {
  const reader = await getProtocolParamsReader();
  return reader.getPegInConfiguration();
}

/** Get the latest offchain params version number from the contract. */
export async function getLatestOffchainParamsVersion(): Promise<number> {
  const reader = await getProtocolParamsReader();
  return reader.getLatestOffchainParamsVersion();
}

/** Get offchain parameters for a specific version from the contract. */
export async function getOffchainParamsByVersion(
  versionNumber: number,
): Promise<VersionedOffchainParams> {
  const reader = await getProtocolParamsReader();
  return reader.getOffchainParamsByVersion(versionNumber);
}

/**
 * Get timelockPegin for a specific offchain params version.
 * timelockPegin = uint16(timelockAssert), matching PeginLogic.sol:115.
 */
export async function getTimelockPeginByVersion(
  offchainParamsVersion: number,
): Promise<number> {
  const reader = await getProtocolParamsReader();
  return reader.getTimelockPeginByVersion(offchainParamsVersion);
}

/**
 * Fetches all offchain params versions from the contract via a single
 * multicall. Versions whose payload fails validation are skipped, and a
 * warning is logged for each so an unexpected historical regression is
 * still observable in the app's telemetry.
 */
export async function fetchAllOffchainParams(): Promise<AllOffchainParamsData> {
  const reader = await getProtocolParamsReader();
  return reader.fetchAllOffchainParams((version, error) => {
    logger.warn(
      `Offchain params v${version} failed validation, skipping: ${error.message}`,
      { category: "protocol-params" },
    );
  });
}
