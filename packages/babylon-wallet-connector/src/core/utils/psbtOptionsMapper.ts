import type { SignInputOptions } from "@/core/types";

/**
 * Maps our standard SignInputOptions format to the wallet provider's toSignInputs format.
 * This is used by wallets that follow the OKX/OneKey API convention.
 *
 * @param signInputs - Array of sign input configurations
 * @returns Array of inputs in toSignInputs format
 */
export function mapSignInputsToToSignInputs(signInputs: SignInputOptions[]) {
  return signInputs.map((input) => ({
    index: input.index,
    publicKey: input.publicKey,
    address: input.address,
    sighashTypes: input.sighashTypes,
    disableTweakSigner: input.disableTweakSigner,
  }));
}
