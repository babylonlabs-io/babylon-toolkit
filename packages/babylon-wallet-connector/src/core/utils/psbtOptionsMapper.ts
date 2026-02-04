import type { SignInputOptions } from "@/core/types";

/**
 * Maps our standard SignInputOptions format to the wallet provider's toSignInputs format.
 * This is used by wallets that follow the UniSat/OKX API convention.
 *
 * @param signInputs - Array of sign input configurations
 * @param additionalFieldsFn - Optional callback to add wallet-specific fields to each input
 * @returns Array of inputs in toSignInputs format
 */
export function mapSignInputsToToSignInputs(
  signInputs: SignInputOptions[],
  additionalFieldsFn?: (input: SignInputOptions) => Record<string, any>,
) {
  return signInputs.map((input) => ({
    index: input.index,
    publicKey: input.publicKey,
    address: input.address,
    sighashTypes: input.sighashTypes,
    disableTweakSigner: input.disableTweakSigner,
    ...(additionalFieldsFn?.(input) || {}),
  }));
}
