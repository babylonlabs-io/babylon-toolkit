import { describe, expect, it } from 'vitest';

import { materializeAndPinManifests } from '../pinManifests.js';
import type { RegistryClient } from '../registry.js';
import type { ReleaseConfig, ReleasePackages } from '../workspace.js';

const releaseConfig: ReleaseConfig = {
  registryUrl: 'https://registry.npmjs.org',
  releaseTagPattern: '{projectName}/{version}',
  projectGlobs: ['packages/*'],
};

describe('materializeAndPinManifests', () => {
  it('refuses to publish a package that depends on a private workspace package', async () => {
    // nx versions and tags a private package but never publishes it, so
    // wallet-connector@1.66.1 shipped pinning a signer version that only ever
    // existed as a git tag.
    const releasePackages: ReleasePackages = new Map([
      [
        '@babylonlabs-io/wallet-connector',
        {
          packageName: '@babylonlabs-io/wallet-connector',
          manifestPath: '/packages/babylon-wallet-connector/package.json',
          manifest: {
            name: '@babylonlabs-io/wallet-connector',
            version: '1.67.2',
            dependencies: {
              '@babylonlabs-io/ledger-vault-signer': 'workspace:*',
            },
          },
        },
      ],
      [
        '@babylonlabs-io/ledger-vault-signer',
        {
          packageName: '@babylonlabs-io/ledger-vault-signer',
          manifestPath: '/packages/babylon-ledger-vault-signer/package.json',
          manifest: {
            name: '@babylonlabs-io/ledger-vault-signer',
            version: '0.2.0',
            private: true,
          },
        },
      ],
    ]);

    const registry: RegistryClient = {
      fetchPublishedVersions: async () => [],
    };

    await expect(
      materializeAndPinManifests({
        projectsToPublish: ['@babylonlabs-io/wallet-connector'],
        projectsVersionData: {
          '@babylonlabs-io/wallet-connector': {
            currentVersion: '1.67.2',
            newVersion: '1.67.3',
          },
          '@babylonlabs-io/ledger-vault-signer': {
            currentVersion: '0.1.0',
            newVersion: '0.2.0',
          },
        },
        releasePackages,
        releaseConfig,
        registry,
        dryRun: true,
      })
    ).rejects.toThrow('private workspace package');
  });

  it('refuses to publish a pin on a sibling version the registry does not have', async () => {
    const releasePackages: ReleasePackages = new Map([
      [
        '@babylonlabs-io/ts-sdk',
        {
          packageName: '@babylonlabs-io/ts-sdk',
          manifestPath: '/packages/babylon-ts-sdk/package.json',
          manifest: {
            name: '@babylonlabs-io/ts-sdk',
            version: '0.62.1',
            dependencies: {
              '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
            },
          },
        },
      ],
      [
        '@babylonlabs-io/babylon-tbv-rust-wasm',
        {
          packageName: '@babylonlabs-io/babylon-tbv-rust-wasm',
          manifestPath: '/packages/babylon-tbv-rust-wasm/package.json',
          manifest: {
            name: '@babylonlabs-io/babylon-tbv-rust-wasm',
            version: '0.1.0',
          },
        },
      ],
    ]);

    const registry: RegistryClient = {
      fetchPublishedVersions: async () => ['0.14.0', '0.15.0'],
    };

    await expect(
      materializeAndPinManifests({
        projectsToPublish: ['@babylonlabs-io/ts-sdk'],
        projectsVersionData: {
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.62.1',
            newVersion: '0.62.2',
          },
          // A tag exists for 0.16.0 but the publish never landed.
          '@babylonlabs-io/babylon-tbv-rust-wasm': {
            currentVersion: '0.16.0',
            newVersion: null,
          },
        },
        releasePackages,
        releaseConfig,
        registry,
        dryRun: true,
      })
    ).rejects.toThrow('does not exist on the registry');
  });
});
