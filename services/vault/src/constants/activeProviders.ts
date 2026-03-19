/**
 * Hardcoded list of known active/stable vault provider addresses (testnet).
 * Temporary -- will be replaced by proxy service lookup.
 *
 * Source: registered actors on alpha-testnet (bbn-test-6)
 * - Babylon Labs Vault Provider
 * - NEOWIZ Vault Provider
 * - Zellic
 * - HoodRun
 */
export const ACTIVE_PROVIDER_ADDRESSES: string[] = [
  "0x7c310c9e42b2e1e4b5dee2e702f83d5667f2d3d3", // Babylon Labs VP — rpc.vault-provider-0.alpha-testnet.babylonlabs.io
  "0x48b24aa4c976bd154d3525f01c6cc2bf6cc27a14", // NEOWIZ VP — vaultd-rpc.babylon.pmang.cloud
  "0x1f5398a3ab09875ea775aeb2ff39106b9117783b", // Zellic — bbn-test-6-vp-rpc.zellic.net
  "0x67f62e296452b8a0aa6923c4dcfba682ee7bc816", // HoodRun — vp-bbn-testnet.hoodrun.io
];

export function isActiveProvider(address: string): boolean {
  return ACTIVE_PROVIDER_ADDRESSES.some(
    (a) => a.toLowerCase() === address.toLowerCase(),
  );
}
