import { describe, expect, it, vi } from 'vitest';

import type { PackageManifest } from '../manifest.js';
import { materializeAndPinManifests } from '../pinManifests.js';
import type { RegistryClient } from '../registry.js';
import type { ReleaseTagReader } from '../releaseTags.js';
import type { ReleasePackages } from '../workspace.js';

const releaseTagsFor = (
  versionsByProject: Record<string, readonly string[]>
): ReleaseTagReader => ({
  readReleasedVersions: async (projectName) =>
    versionsByProject[projectName] ?? [],
});

const registryWith = (
  versionsByPackage: Record<string, readonly string[] | null>
): RegistryClient => ({
  fetchPublishedVersions: async (packageName) =>
    versionsByPackage[packageName] ?? null,
});

const releasePackage = (
  packageName: string,
  manifestPath: string,
  manifest: PackageManifest
) => [packageName, { packageName, manifestPath, manifest }] as const;

describe('materializeAndPinManifests', () => {
  it('writes the version this run resolved and pins the sibling at its released version', async () => {
    // The exact mechanism behind ts-sdk@0.62.1 -> rust-wasm@0.1.0: only ts-sdk
    // is bumped, so nothing rewrites the sibling spec and pnpm substitutes the
    // stale 0.1.0 sitting in the WASM package's manifest.
    const releasePackages: ReleasePackages = new Map([
      releasePackage(
        '@babylonlabs-io/ts-sdk',
        '/packages/babylon-ts-sdk/package.json',
        {
          name: '@babylonlabs-io/ts-sdk',
          version: '0.1.2',
          dependencies: {
            '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
            buffer: '6.0.3',
          },
        }
      ),
      releasePackage(
        '@babylonlabs-io/babylon-tbv-rust-wasm',
        '/packages/babylon-tbv-rust-wasm/package.json',
        { name: '@babylonlabs-io/babylon-tbv-rust-wasm', version: '0.1.0' }
      ),
    ]);
    const writeManifest = vi.fn();

    await materializeAndPinManifests({
      projectsToPublish: ['@babylonlabs-io/ts-sdk'],
      projectsVersionData: {
        '@babylonlabs-io/ts-sdk': {
          currentVersion: '0.62.1',
          newVersion: '0.62.2',
        },
        '@babylonlabs-io/babylon-tbv-rust-wasm': {
          currentVersion: '0.15.0',
          newVersion: null,
        },
      },
      releasePackages,
      registry: registryWith({
        '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.14.0', '0.15.0'],
      }),
      releaseTags: releaseTagsFor({
        '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.15.0', '0.14.0'],
      }),
      writeManifest,
      dryRun: false,
    });

    expect(writeManifest).toHaveBeenCalledWith(
      '/packages/babylon-ts-sdk/package.json',
      {
        name: '@babylonlabs-io/ts-sdk',
        version: '0.62.2',
        dependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': '0.15.0',
          buffer: '6.0.3',
        },
      }
    );
    // The sibling is not being published, but its own manifest still stops lying.
    expect(writeManifest).toHaveBeenCalledWith(
      '/packages/babylon-tbv-rust-wasm/package.json',
      { name: '@babylonlabs-io/babylon-tbv-rust-wasm', version: '0.15.0' }
    );
  });

  it('writes nothing during a dry run', async () => {
    const writeManifest = vi.fn();

    await materializeAndPinManifests({
      projectsToPublish: ['@babylonlabs-io/ts-sdk'],
      projectsVersionData: {
        '@babylonlabs-io/ts-sdk': {
          currentVersion: '0.62.1',
          newVersion: '0.62.2',
        },
        '@babylonlabs-io/babylon-tbv-rust-wasm': {
          currentVersion: '0.15.0',
          newVersion: null,
        },
      },
      releasePackages: new Map([
        releasePackage(
          '@babylonlabs-io/ts-sdk',
          '/packages/babylon-ts-sdk/package.json',
          {
            name: '@babylonlabs-io/ts-sdk',
            version: '0.1.2',
            dependencies: {
              '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
            },
          }
        ),
        releasePackage(
          '@babylonlabs-io/babylon-tbv-rust-wasm',
          '/packages/babylon-tbv-rust-wasm/package.json',
          { name: '@babylonlabs-io/babylon-tbv-rust-wasm', version: '0.1.0' }
        ),
      ]),
      registry: registryWith({
        '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.15.0'],
      }),
      releaseTags: releaseTagsFor({
        '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.15.0'],
      }),
      writeManifest,
      dryRun: true,
    });

    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('resolves a sibling nx filtered out of the run from its latest stable tag', async () => {
    // The release-candidate path versions a single project, so its siblings
    // never appear in the version data at all.
    const writeManifest = vi.fn();

    await materializeAndPinManifests({
      projectsToPublish: ['@babylonlabs-io/wallet-connector'],
      projectsVersionData: {
        '@babylonlabs-io/wallet-connector': {
          currentVersion: '1.67.2',
          newVersion: '1.67.3-rc.0',
        },
      },
      releasePackages: new Map([
        releasePackage(
          '@babylonlabs-io/wallet-connector',
          '/packages/babylon-wallet-connector/package.json',
          {
            name: '@babylonlabs-io/wallet-connector',
            version: '1.67.2',
            dependencies: { '@babylonlabs-io/core-ui': 'workspace:*' },
          }
        ),
        releasePackage(
          '@babylonlabs-io/core-ui',
          '/packages/babylon-core-ui/package.json',
          { name: '@babylonlabs-io/core-ui', version: '0.0.0-semantic-release' }
        ),
      ]),
      registry: registryWith({ '@babylonlabs-io/core-ui': ['1.108.1'] }),
      releaseTags: releaseTagsFor({
        // A prerelease sorts first, and a stable dependent must not pin it.
        '@babylonlabs-io/core-ui': ['1.109.0-rc.0', '1.108.1'],
      }),
      writeManifest,
      dryRun: false,
    });

    expect(writeManifest).toHaveBeenCalledWith(
      '/packages/babylon-wallet-connector/package.json',
      expect.objectContaining({
        dependencies: { '@babylonlabs-io/core-ui': '1.108.1' },
      })
    );
  });

  it('refuses to pin a sibling that nx versioned but the prerelease gate dropped from the run', async () => {
    // The gate drops a stable-numbered dependent nx dragged into an RC run.
    // nx still reports a newVersion for it, so if `publishedByThisRun` were
    // read off the version data the pin would be written unchecked - the
    // phantom pin this module exists to stop.
    const writeManifest = vi.fn();

    await expect(
      materializeAndPinManifests({
        projectsToPublish: ['@babylonlabs-io/wallet-connector'],
        projectsVersionData: {
          '@babylonlabs-io/wallet-connector': {
            currentVersion: '1.69.0',
            newVersion: '1.69.1-rc.0',
          },
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.63.0',
            newVersion: '0.63.1',
          },
        },
        releasePackages: new Map([
          releasePackage(
            '@babylonlabs-io/wallet-connector',
            '/packages/babylon-wallet-connector/package.json',
            {
              name: '@babylonlabs-io/wallet-connector',
              version: '1.69.0',
              dependencies: { '@babylonlabs-io/ts-sdk': 'workspace:*' },
            }
          ),
          releasePackage(
            '@babylonlabs-io/ts-sdk',
            '/packages/babylon-ts-sdk/package.json',
            { name: '@babylonlabs-io/ts-sdk', version: '0.63.0' }
          ),
        ]),
        registry: registryWith({ '@babylonlabs-io/ts-sdk': ['0.63.0'] }),
        releaseTags: releaseTagsFor({
          '@babylonlabs-io/ts-sdk': ['0.63.0'],
        }),
        writeManifest,
        dryRun: false,
      })
    ).rejects.toThrow('0.63.1');

    expect(writeManifest).not.toHaveBeenCalledWith(
      '/packages/babylon-wallet-connector/package.json',
      expect.objectContaining({
        dependencies: { '@babylonlabs-io/ts-sdk': '0.63.1' },
      })
    );
  });

  it('refuses to publish a package that depends on a private workspace package', async () => {
    // nx versions and tags a private package but never publishes it, so
    // wallet-connector@1.66.1 shipped pinning a signer version that only ever
    // existed as a git tag.
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
        releasePackages: new Map([
          releasePackage(
            '@babylonlabs-io/wallet-connector',
            '/packages/babylon-wallet-connector/package.json',
            {
              name: '@babylonlabs-io/wallet-connector',
              version: '1.67.2',
              dependencies: {
                '@babylonlabs-io/ledger-vault-signer': 'workspace:*',
              },
            }
          ),
          releasePackage(
            '@babylonlabs-io/ledger-vault-signer',
            '/packages/babylon-ledger-vault-signer/package.json',
            {
              name: '@babylonlabs-io/ledger-vault-signer',
              version: '0.2.0',
              private: true,
            }
          ),
        ]),
        registry: registryWith({}),
        releaseTags: releaseTagsFor({}),
        writeManifest: vi.fn(),
        dryRun: true,
      })
    ).rejects.toThrow('private workspace package');
  });

  it('refuses to publish a pin on a sibling version the registry does not have', async () => {
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
        releasePackages: new Map([
          releasePackage(
            '@babylonlabs-io/ts-sdk',
            '/packages/babylon-ts-sdk/package.json',
            {
              name: '@babylonlabs-io/ts-sdk',
              version: '0.62.1',
              dependencies: {
                '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
              },
            }
          ),
          releasePackage(
            '@babylonlabs-io/babylon-tbv-rust-wasm',
            '/packages/babylon-tbv-rust-wasm/package.json',
            { name: '@babylonlabs-io/babylon-tbv-rust-wasm', version: '0.1.0' }
          ),
        ]),
        registry: registryWith({
          '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.14.0', '0.15.0'],
        }),
        releaseTags: releaseTagsFor({
          '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.16.0', '0.15.0'],
        }),
        writeManifest: vi.fn(),
        dryRun: true,
      })
    ).rejects.toThrow('does not exist on the registry');
  });

  it('lets a never-released package through when nothing published depends on it', async () => {
    // A new package under the release globs has no tag and so no truthful
    // version, but nx still versions it. Blocking on that would stop every
    // unrelated package from releasing.
    const writeManifest = vi.fn();

    await materializeAndPinManifests({
      projectsToPublish: ['@babylonlabs-io/ts-sdk'],
      projectsVersionData: {
        '@babylonlabs-io/ts-sdk': {
          currentVersion: '0.62.1',
          newVersion: '0.62.2',
        },
        '@babylonlabs-io/brand-new': {
          currentVersion: '0.0.0-semantic-release',
          newVersion: null,
        },
      },
      releasePackages: new Map([
        releasePackage(
          '@babylonlabs-io/ts-sdk',
          '/packages/babylon-ts-sdk/package.json',
          { name: '@babylonlabs-io/ts-sdk', version: '0.62.1' }
        ),
        releasePackage(
          '@babylonlabs-io/brand-new',
          '/packages/babylon-brand-new/package.json',
          { name: '@babylonlabs-io/brand-new', version: '0.0.0-semantic-release' }
        ),
      ]),
      registry: registryWith({}),
      releaseTags: releaseTagsFor({}),
      writeManifest,
      dryRun: false,
    });

    expect(writeManifest).toHaveBeenCalledWith(
      '/packages/babylon-ts-sdk/package.json',
      expect.objectContaining({ version: '0.62.2' })
    );
  });

  it('refuses a version nx read off disk because no release tag matched', async () => {
    await expect(
      materializeAndPinManifests({
        projectsToPublish: ['@babylonlabs-io/ts-sdk'],
        projectsVersionData: {
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.62.1',
            newVersion: '0.62.2',
          },
          '@babylonlabs-io/babylon-tbv-rust-wasm': {
            // The on-disk fallback: real semver, really on the registry, and 14
            // minor versions stale.
            currentVersion: '0.1.0',
            newVersion: null,
          },
        },
        releasePackages: new Map([
          releasePackage(
            '@babylonlabs-io/ts-sdk',
            '/packages/babylon-ts-sdk/package.json',
            {
              name: '@babylonlabs-io/ts-sdk',
              version: '0.62.1',
              dependencies: {
                '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
              },
            }
          ),
          releasePackage(
            '@babylonlabs-io/babylon-tbv-rust-wasm',
            '/packages/babylon-tbv-rust-wasm/package.json',
            { name: '@babylonlabs-io/babylon-tbv-rust-wasm', version: '0.1.0' }
          ),
        ]),
        registry: registryWith({
          '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.1.0', '0.15.0'],
        }),
        releaseTags: releaseTagsFor({
          '@babylonlabs-io/babylon-tbv-rust-wasm': ['0.15.0', '0.14.0'],
        }),
        writeManifest: vi.fn(),
        dryRun: true,
      })
    ).rejects.toThrow('has no release tag');
  });

  it('refuses a local protocol on a dependency that is not a release sibling', async () => {
    await expect(
      materializeAndPinManifests({
        projectsToPublish: ['@babylonlabs-io/ts-sdk'],
        projectsVersionData: {
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.62.1',
            newVersion: '0.62.2',
          },
        },
        releasePackages: new Map([
          releasePackage(
            '@babylonlabs-io/ts-sdk',
            '/packages/babylon-ts-sdk/package.json',
            {
              name: '@babylonlabs-io/ts-sdk',
              version: '0.62.1',
              dependencies: { '@internal/some-tool': 'workspace:*' },
            }
          ),
        ]),
        registry: registryWith({}),
        releaseTags: releaseTagsFor({}),
        writeManifest: vi.fn(),
        dryRun: true,
      })
    ).rejects.toThrow('local protocol');
  });
});
