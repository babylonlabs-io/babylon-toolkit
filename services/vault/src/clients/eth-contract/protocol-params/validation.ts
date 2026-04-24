/**
 * Validation for protocol parameters fetched from the ProtocolParams contract.
 *
 * These values feed Bitcoin script construction and deposit validation.
 * Invalid params must be caught before they reach transaction-building code,
 * since errors after wallet signing prompts are unrecoverable.
 */

import type {
  PegInConfiguration,
  TBVProtocolParams,
  VersionedOffchainParams,
} from "./query";

/**
 * Maximum value for a Solidity uint16.
 * PeginLogic.sol casts timelockAssert to uint16, so values above this are invalid.
 */
const UINT16_MAX = 65535;

/** Maximum valid value for basis points (100%) */
const MAX_BASIS_POINTS = 10000;

/**
 * Validate offchain params consistency and bounds.
 * Throws on invalid values to prevent constructing invalid Bitcoin scripts.
 */
export function validateOffchainParams(params: VersionedOffchainParams): void {
  const errors: string[] = [];

  if (params.timelockAssert <= 0n) {
    errors.push(
      `timelockAssert must be positive, got ${params.timelockAssert}`,
    );
  }
  if (params.timelockAssert > BigInt(UINT16_MAX)) {
    errors.push(
      `timelockAssert ${params.timelockAssert} exceeds uint16 max (${UINT16_MAX})`,
    );
  }

  if (params.timelockChallengeAssert <= 0n) {
    errors.push(
      `timelockChallengeAssert must be positive, got ${params.timelockChallengeAssert}`,
    );
  }

  if (params.tRefund <= 0) {
    errors.push(`tRefund must be positive, got ${params.tRefund}`);
  }

  if (params.tStale <= 0) {
    errors.push(`tStale must be positive, got ${params.tStale}`);
  }

  if (params.securityCouncilKeys.length === 0) {
    errors.push("securityCouncilKeys must not be empty");
  }

  if (params.councilQuorum <= 0) {
    errors.push(`councilQuorum must be positive, got ${params.councilQuorum}`);
  }
  if (params.councilQuorum > params.securityCouncilKeys.length) {
    errors.push(
      `councilQuorum (${params.councilQuorum}) exceeds securityCouncilKeys count (${params.securityCouncilKeys.length})`,
    );
  }

  if (params.feeRate <= 0n) {
    errors.push(`feeRate must be positive, got ${params.feeRate}`);
  }

  if (params.minPeginFeeRate <= 0n) {
    errors.push(
      `minPeginFeeRate must be positive, got ${params.minPeginFeeRate}`,
    );
  }

  if (
    !Number.isInteger(params.proverProgramVersion) ||
    params.proverProgramVersion < 0 ||
    params.proverProgramVersion > 65535
  ) {
    errors.push(
      `proverProgramVersion must be a uint16, got ${params.proverProgramVersion}`,
    );
  }

  if (
    !Number.isInteger(params.minPrepeginDepth) ||
    params.minPrepeginDepth <= 0 ||
    params.minPrepeginDepth > 4_294_967_295
  ) {
    errors.push(
      `minPrepeginDepth must be a uint32 in [1, 4294967295], got ${params.minPrepeginDepth}`,
    );
  }

  if (params.babeTotalInstances <= 0) {
    errors.push(
      `babeTotalInstances must be positive, got ${params.babeTotalInstances}`,
    );
  }
  if (params.babeInstancesToFinalize <= 0) {
    errors.push(
      `babeInstancesToFinalize must be positive, got ${params.babeInstancesToFinalize}`,
    );
  }
  if (params.babeInstancesToFinalize > params.babeTotalInstances) {
    errors.push(
      `babeInstancesToFinalize (${params.babeInstancesToFinalize}) exceeds babeTotalInstances (${params.babeTotalInstances})`,
    );
  }

  if (
    params.minVpCommissionBps < 0 ||
    params.minVpCommissionBps > MAX_BASIS_POINTS
  ) {
    errors.push(
      `minVpCommissionBps must be in [0, ${MAX_BASIS_POINTS}], got ${params.minVpCommissionBps}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid offchain protocol parameters: ${errors.join("; ")}`,
    );
  }
}

/**
 * Validate TBV protocol params returned from the contract.
 * Ensures amounts are positive and internally consistent.
 */
export function validateTBVProtocolParams(params: TBVProtocolParams): void {
  const errors: string[] = [];

  if (params.minimumPegInAmount <= 0n) {
    errors.push(
      `minimumPegInAmount must be positive, got ${params.minimumPegInAmount}`,
    );
  }

  if (params.maxPegInAmount < params.minimumPegInAmount) {
    errors.push(
      `maxPegInAmount (${params.maxPegInAmount}) must be >= minimumPegInAmount (${params.minimumPegInAmount})`,
    );
  }

  if (params.pegInAckTimeout <= 0n) {
    errors.push(
      `pegInAckTimeout must be positive, got ${params.pegInAckTimeout}`,
    );
  }

  if (params.pegInActivationTimeout <= 0n) {
    errors.push(
      `pegInActivationTimeout must be positive, got ${params.pegInActivationTimeout}`,
    );
  }

  if (
    !Number.isInteger(params.maxHtlcOutputCount) ||
    params.maxHtlcOutputCount <= 0 ||
    params.maxHtlcOutputCount > 255
  ) {
    errors.push(
      `maxHtlcOutputCount must be an integer in [1, 255], got ${params.maxHtlcOutputCount}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid TBV protocol parameters: ${errors.join("; ")}`);
  }
}

/**
 * Validate the full peg-in configuration after assembly.
 * Checks both TBV params and offchain params consistency.
 */
export function validatePegInConfiguration(config: PegInConfiguration): void {
  validateTBVProtocolParams(config);
  validateOffchainParams(config.offchainParams);
}
