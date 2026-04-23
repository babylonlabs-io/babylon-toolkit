import type { SignInputOptions } from "@/core/types";

/**
 * Resolve the tweak-signer flag from SignInputOptions.
 *
 * Precedence: `useTweakedSigner` wins when both fields are set. Matches the
 * resolution order used by upstream wallet implementations (e.g. UniSat's
 * keyring). Returns `undefined` when neither field is provided so the wallet
 * can apply its default.
 */
export function resolveUseTweakedSigner(input: {
  useTweakedSigner?: boolean;
  disableTweakSigner?: boolean;
}): boolean | undefined {
  if (typeof input.useTweakedSigner === "boolean") {
    return input.useTweakedSigner;
  }
  if (typeof input.disableTweakSigner === "boolean") {
    return !input.disableTweakSigner;
  }
  return undefined;
}

/**
 * Maps our standard SignInputOptions format to the wallet provider's toSignInputs format.
 * This is used by wallets that follow the OKX/OneKey API convention.
 *
 * Forwards both `useTweakedSigner` and `disableTweakSigner` in sync so older
 * wallet versions that only understand `disableTweakSigner` and newer versions
 * that understand `useTweakedSigner` both receive a consistent instruction.
 *
 * @param signInputs - Array of sign input configurations
 * @returns Array of inputs in toSignInputs format
 */
export function mapSignInputsToToSignInputs(signInputs: SignInputOptions[]) {
  return signInputs.map((input) => {
    const useTweakedSigner = resolveUseTweakedSigner(input);
    return {
      index: input.index,
      publicKey: input.publicKey,
      address: input.address,
      sighashTypes: input.sighashTypes,
      ...(useTweakedSigner !== undefined && {
        useTweakedSigner,
        disableTweakSigner: !useTweakedSigner,
      }),
    };
  });
}
