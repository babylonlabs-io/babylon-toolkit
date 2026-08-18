import { describe, expect, it } from 'vitest';

import {
  assertSiblingIsInstallable,
  findSiblingPinViolations,
  pinSiblingDependencies,
  type PackageManifest,
  type SiblingRelease,
} from '../manifest.js';

describe('pinSiblingDependencies', () => {
  it('pins a sibling at the version this release resolved, not the stale one on disk', () => {
    // The shape that shipped as ts-sdk@0.62.1. On disk
    // packages/babylon-tbv-rust-wasm/package.json says 0.1.0, because version
    // bumps are never committed back, so pnpm substituted 0.1.0 while the
    // actually released version was 0.15.0.
    const manifest: PackageManifest = {
      name: '@babylonlabs-io/ts-sdk',
      version: '0.62.2',
      dependencies: {
        '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
        buffer: '6.0.3',
      },
    };
    const siblings = new Map<string, SiblingRelease>([
      [
        '@babylonlabs-io/babylon-tbv-rust-wasm',
        {
          packageName: '@babylonlabs-io/babylon-tbv-rust-wasm',
          version: '0.15.0',
          publishedByThisRun: false,
        },
      ],
    ]);

    const pinned = pinSiblingDependencies(manifest, siblings);

    expect(pinned.manifest.dependencies).toEqual({
      '@babylonlabs-io/babylon-tbv-rust-wasm': '0.15.0',
      buffer: '6.0.3',
    });
    expect(pinned.rewrites).toEqual([
      {
        section: 'dependencies',
        dependencyName: '@babylonlabs-io/babylon-tbv-rust-wasm',
        from: 'workspace:*',
        to: '0.15.0',
      },
    ]);
  });

  it('leaves devDependencies alone', () => {
    // Every package depends on the private @internal/eslint-config there.
    // Consumers never install devDependencies, and the package is not
    // releasable, so rewriting it would fail the release for no benefit.
    const manifest: PackageManifest = {
      name: '@babylonlabs-io/core-ui',
      devDependencies: { '@internal/eslint-config': 'workspace:*' },
    };

    const pinned = pinSiblingDependencies(manifest, new Map());

    expect(pinned.manifest.devDependencies).toEqual({
      '@internal/eslint-config': 'workspace:*',
    });
    expect(pinned.rewrites).toEqual([]);
  });
});

describe('findSiblingPinViolations', () => {
  it('rejects a manifest that would publish a workspace protocol', () => {
    // Every release candidate published so far shipped this literally: the RC
    // path used `npm publish`, which cannot resolve `workspace:` at all.
    const violations = findSiblingPinViolations(
      {
        name: '@babylonlabs-io/ts-sdk',
        dependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
        },
      },
      new Map<string, SiblingRelease>([
        [
          '@babylonlabs-io/babylon-tbv-rust-wasm',
          {
            packageName: '@babylonlabs-io/babylon-tbv-rust-wasm',
            version: '0.15.0',
            publishedByThisRun: false,
          },
        ],
      ])
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('workspace:*');
  });

  it('rejects a pin that disagrees with the version being released', () => {
    // The shape that shipped as wallet-connector@1.67.2, which pinned a signer
    // version that does not exist while the released one was 0.4.0.
    const violations = findSiblingPinViolations(
      {
        name: '@babylonlabs-io/wallet-connector',
        dependencies: {
          '@babylonlabs-io/ledger-vault-signer': '0.0.0-semantic-release',
        },
      },
      new Map<string, SiblingRelease>([
        [
          '@babylonlabs-io/ledger-vault-signer',
          {
            packageName: '@babylonlabs-io/ledger-vault-signer',
            version: '0.4.0',
            publishedByThisRun: false,
          },
        ],
      ])
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain(
      'this release resolves @babylonlabs-io/ledger-vault-signer to 0.4.0'
    );
  });

  it('rejects a sibling that resolved to the placeholder version nx writes when no git tag matched', () => {
    const violations = findSiblingPinViolations(
      {
        name: '@babylonlabs-io/wallet-connector',
        dependencies: { '@babylonlabs-io/core-ui': '0.0.0-semantic-release' },
      },
      new Map<string, SiblingRelease>([
        [
          '@babylonlabs-io/core-ui',
          {
            packageName: '@babylonlabs-io/core-ui',
            version: '0.0.0-semantic-release',
            publishedByThisRun: false,
          },
        ],
      ])
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('placeholder version');
  });

  it('rejects a sibling pinned with a wildcard', () => {
    const violations = findSiblingPinViolations(
      {
        name: '@babylonlabs-io/wallet-connector',
        dependencies: { '@babylonlabs-io/core-ui': '*' },
      },
      new Map<string, SiblingRelease>([
        [
          '@babylonlabs-io/core-ui',
          {
            packageName: '@babylonlabs-io/core-ui',
            version: '1.108.1',
            publishedByThisRun: false,
          },
        ],
      ])
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('floats to whatever version is newest');
  });

  it('accepts a manifest already pinned at the resolved version', () => {
    const violations = findSiblingPinViolations(
      {
        name: '@babylonlabs-io/ts-sdk',
        dependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': '0.15.0',
          buffer: '6.0.3',
        },
      },
      new Map<string, SiblingRelease>([
        [
          '@babylonlabs-io/babylon-tbv-rust-wasm',
          {
            packageName: '@babylonlabs-io/babylon-tbv-rust-wasm',
            version: '0.15.0',
            publishedByThisRun: false,
          },
        ],
      ])
    );

    expect(violations).toEqual([]);
  });
});

describe('assertSiblingIsInstallable', () => {
  it('refuses a pin whose version was tagged but never published', () => {
    // @babylonlabs-io/ledger-vault-signer/0.2.0 is a real git tag with no npm
    // version, and wallet-connector@1.66.1 has pinned it ever since.
    expect(() =>
      assertSiblingIsInstallable(
        {
          packageName: '@babylonlabs-io/ledger-vault-signer',
          version: '0.2.0',
          publishedByThisRun: false,
        },
        ['0.0.1', '0.4.0']
      )
    ).toThrow('does not exist on the registry');
  });

  it('refuses a pin on a package that has never been published', () => {
    expect(() =>
      assertSiblingIsInstallable(
        {
          packageName: '@babylonlabs-io/ledger-vault-signer',
          version: '0.4.0',
          publishedByThisRun: false,
        },
        null
      )
    ).toThrow('has never been published');
  });

  it('accepts a version this run is about to publish, which cannot be on the registry yet', () => {
    expect(() =>
      assertSiblingIsInstallable(
        {
          packageName: '@babylonlabs-io/core-ui',
          version: '1.109.0',
          publishedByThisRun: true,
        },
        ['1.108.1']
      )
    ).not.toThrow();
  });

  it('accepts a version that is already on the registry', () => {
    expect(() =>
      assertSiblingIsInstallable(
        {
          packageName: '@babylonlabs-io/babylon-tbv-rust-wasm',
          version: '0.15.0',
          publishedByThisRun: false,
        },
        ['0.14.0', '0.15.0']
      )
    ).not.toThrow();
  });
});
