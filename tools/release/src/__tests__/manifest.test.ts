import { describe, expect, it } from 'vitest';

import {
  assertSiblingIsInstallable,
  assertVersionWasReleased,
  findSiblingPinViolations,
  findSurvivingLocalProtocols,
  formatViolations,
  pinSiblingDependencies,
  type PackageManifest,
  type SiblingRelease,
} from '../manifest.js';

const wasm = (version: string, publishedByThisRun = false): SiblingRelease => ({
  packageName: '@babylonlabs-io/babylon-tbv-rust-wasm',
  version,
  publishedByThisRun,
});

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

    const pinned = pinSiblingDependencies(
      manifest,
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

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

  it('keeps the range a workspace caret asked for', () => {
    const pinned = pinSiblingDependencies(
      {
        name: '@babylonlabs-io/wallet-connector',
        peerDependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:^',
        },
      },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(pinned.manifest.peerDependencies).toEqual({
      '@babylonlabs-io/babylon-tbv-rust-wasm': '^0.15.0',
    });
  });

  it('leaves a workspace range it cannot translate for the violation check to reject', () => {
    const pinned = pinSiblingDependencies(
      {
        name: '@babylonlabs-io/ts-sdk',
        dependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:>=0.15.0',
        },
      },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(pinned.rewrites).toEqual([]);
    expect(
      pinned.manifest.dependencies?.['@babylonlabs-io/babylon-tbv-rust-wasm']
    ).toBe('workspace:>=0.15.0');
  });

  it('leaves devDependencies alone even for a package it knows about', () => {
    // @internal/eslint-config is private and unreleasable. Consumers never
    // install devDependencies, so rewriting it would fail every release.
    const pinned = pinSiblingDependencies(
      {
        name: '@babylonlabs-io/core-ui',
        devDependencies: { '@internal/eslint-config': 'workspace:*' },
      },
      new Map([
        [
          '@internal/eslint-config',
          {
            packageName: '@internal/eslint-config',
            version: '0.0.0',
            publishedByThisRun: false,
          },
        ],
      ])
    );

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
        dependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
        },
      },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(violations.map((violation) => violation.code)).toEqual([
      'local-protocol',
    ]);
  });

  it('rejects a pin that disagrees with the version being released', () => {
    // The shape that shipped as wallet-connector@1.67.2, which pinned a signer
    // version that does not exist while the released one was 0.4.0.
    const violations = findSiblingPinViolations(
      {
        dependencies: {
          '@babylonlabs-io/ledger-vault-signer': '0.0.0-semantic-release',
        },
      },
      new Map([
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

    expect(violations.map((violation) => violation.code)).toEqual(['mismatch']);
  });

  it('rejects a sibling that resolved to the placeholder version nx writes when no git tag matched', () => {
    const violations = findSiblingPinViolations(
      { dependencies: { '@babylonlabs-io/core-ui': '0.0.0-semantic-release' } },
      new Map([
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

    expect(violations.map((violation) => violation.code)).toEqual([
      'placeholder',
    ]);
  });

  it('rejects a sibling pinned with a wildcard', () => {
    const violations = findSiblingPinViolations(
      { dependencies: { '@babylonlabs-io/babylon-tbv-rust-wasm': '*' } },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(violations.map((violation) => violation.code)).toEqual(['wildcard']);
  });

  it('rejects a sibling pinned with a floating range', () => {
    const violations = findSiblingPinViolations(
      { dependencies: { '@babylonlabs-io/babylon-tbv-rust-wasm': '>=0.15.0' } },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(violations.map((violation) => violation.code)).toEqual(['inexact']);
  });

  it('accepts a caret range on the version being released', () => {
    const violations = findSiblingPinViolations(
      {
        peerDependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': '^0.15.0',
        },
      },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(violations).toEqual([]);
  });

  it('checks optionalDependencies too', () => {
    const violations = findSiblingPinViolations(
      {
        optionalDependencies: {
          '@babylonlabs-io/babylon-tbv-rust-wasm': 'workspace:*',
        },
      },
      new Map([['@babylonlabs-io/babylon-tbv-rust-wasm', wasm('0.15.0')]])
    );

    expect(violations.map((violation) => violation.section)).toEqual([
      'optionalDependencies',
    ]);
  });
});

describe('findSurvivingLocalProtocols', () => {
  it('reports a local protocol on a package that is not a release sibling', () => {
    // Nothing does this today, but the whole point of this gate is that
    // "nothing does that today" is how the shipped breakage happened.
    const violations = findSurvivingLocalProtocols({
      dependencies: { '@internal/some-tool': 'workspace:*' },
    });

    expect(violations.map((violation) => violation.code)).toEqual([
      'local-protocol',
    ]);
  });

  it('ignores devDependencies, which consumers never install', () => {
    expect(
      findSurvivingLocalProtocols({
        devDependencies: { '@internal/eslint-config': 'workspace:*' },
      })
    ).toEqual([]);
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
      assertSiblingIsInstallable(wasm('0.16.0', true), ['0.15.0'])
    ).not.toThrow();
  });

  it('accepts a version that is already on the registry', () => {
    expect(() =>
      assertSiblingIsInstallable(wasm('0.15.0'), ['0.14.0', '0.15.0'])
    ).not.toThrow();
  });
});

describe('assertVersionWasReleased', () => {
  it('refuses the on-disk version nx falls back to when no tag matched', () => {
    // 0.1.0 is real semver and really is on the registry, so every other gate
    // would pass while shipping a build 14 minor versions stale.
    expect(() =>
      assertVersionWasReleased(
        '@babylonlabs-io/babylon-tbv-rust-wasm',
        '0.1.0',
        ['0.15.0', '0.14.0']
      )
    ).toThrow('has no release tag');
  });

  it('accepts a version that has a release tag', () => {
    expect(() =>
      assertVersionWasReleased(
        '@babylonlabs-io/babylon-tbv-rust-wasm',
        '0.15.0',
        ['0.15.0', '0.14.0']
      )
    ).not.toThrow();
  });
});

describe('formatViolations', () => {
  it('names the package, every broken spec and the file to fix', () => {
    const message = formatViolations(
      '@babylonlabs-io/ts-sdk',
      'packages/babylon-ts-sdk/package.json',
      [
        {
          code: 'mismatch',
          section: 'dependencies',
          dependencyName: '@babylonlabs-io/babylon-tbv-rust-wasm',
          spec: '0.1.0',
          reason: 'pins "0.1.0" but this release resolves it to 0.15.0',
        },
      ]
    );

    expect(message).toContain('@babylonlabs-io/ts-sdk cannot be published');
    expect(message).toContain(
      'dependencies.@babylonlabs-io/babylon-tbv-rust-wasm pins "0.1.0"'
    );
    expect(message).toContain('packages/babylon-ts-sdk/package.json');
  });
});
