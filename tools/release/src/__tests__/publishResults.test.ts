import { describe, expect, it, vi } from 'vitest';

import {
  assertEveryProjectPublished,
  assertProjectsArePublishable,
  selectProjectsToPublish,
} from '../publishResults.js';

describe('assertProjectsArePublishable', () => {
  it('refuses a release that would version and tag a private package without publishing it', () => {
    // nx attaches no publish target to a private package and drops it from the
    // run while still reporting success, which is how wallet-connector came to
    // pin a signer version that only ever existed as a git tag.
    expect(() =>
      assertProjectsArePublishable([
        {
          projectName: '@babylonlabs-io/wallet-connector',
          packageName: '@babylonlabs-io/wallet-connector',
          isPrivate: false,
        },
        {
          projectName: '@babylonlabs-io/ledger-vault-signer',
          packageName: '@babylonlabs-io/ledger-vault-signer',
          isPrivate: true,
        },
      ])
    ).toThrow('@babylonlabs-io/ledger-vault-signer');
  });

  it('passes when every project in the release can be published', () => {
    expect(() =>
      assertProjectsArePublishable([
        {
          projectName: '@babylonlabs-io/ts-sdk',
          packageName: '@babylonlabs-io/ts-sdk',
          isPrivate: false,
        },
      ])
    ).not.toThrow();
  });
});

describe('assertEveryProjectPublished', () => {
  it('fails when a publish exits non-zero', () => {
    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/ts-sdk'],
        { '@babylonlabs-io/ts-sdk': { code: 1 } },
        { dryRun: false }
      )
    ).toThrow('did not publish');
  });

  it('fails on a project nx skipped, which happens when its dependency failed', () => {
    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/babylon-tbv-rust-wasm', '@babylonlabs-io/ts-sdk'],
        { '@babylonlabs-io/babylon-tbv-rust-wasm': { code: 1 } },
        { dryRun: false }
      )
    ).toThrow('@babylonlabs-io/ts-sdk');
  });

  it('tolerates failures during a dry run, which packs the previous release', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/ts-sdk'],
        { '@babylonlabs-io/ts-sdk': { code: 1 } },
        { dryRun: true }
      )
    ).not.toThrow();

    vi.restoreAllMocks();
  });

  it('passes when every project published', () => {
    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/ts-sdk'],
        { '@babylonlabs-io/ts-sdk': { code: 0 } },
        { dryRun: false }
      )
    ).not.toThrow();
  });
});

describe('selectProjectsToPublish', () => {
  it('publishes every project nx gave a new version on a stable release', () => {
    expect(
      selectProjectsToPublish(
        {
          '@babylonlabs-io/babylon-tbv-rust-wasm': {
            currentVersion: '0.15.0',
            newVersion: '0.15.1',
          },
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.63.0',
            newVersion: '0.63.1',
          },
        },
        { preid: undefined }
      )
    ).toEqual([
      '@babylonlabs-io/babylon-tbv-rust-wasm',
      '@babylonlabs-io/ts-sdk',
    ]);
  });

  it('skips a project nx decided needs no release', () => {
    expect(
      selectProjectsToPublish(
        {
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.63.0',
            newVersion: null,
          },
          '@babylonlabs-io/core-ui': {
            currentVersion: '1.108.1',
            newVersion: '1.108.2',
          },
        },
        { preid: undefined }
      )
    ).toEqual(['@babylonlabs-io/core-ui']);
  });

  it('drops the stable-numbered dependent nx drags into a release-candidate run', () => {
    // Dispatching an RC for the WASM package also bumps ts-sdk, because
    // updateDependents is 'auto' - and nx bumps that dependent with a
    // hardcoded 'patch' that ignores the preid. Publishing it would put a
    // stable-numbered ts-sdk on npm pinned to a release-candidate engine, and
    // tag it on the stable line so no later run ever republishes that number.
    expect(
      selectProjectsToPublish(
        {
          '@babylonlabs-io/babylon-tbv-rust-wasm': {
            currentVersion: '0.15.0',
            newVersion: '0.15.1-rc.0',
          },
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.63.0',
            newVersion: '0.63.1',
          },
        },
        { preid: 'rc' }
      )
    ).toEqual(['@babylonlabs-io/babylon-tbv-rust-wasm']);
  });

  it('keeps a dependent the release candidate did bump to a prerelease', () => {
    expect(
      selectProjectsToPublish(
        {
          '@babylonlabs-io/babylon-tbv-rust-wasm': {
            currentVersion: '0.15.0',
            newVersion: '0.15.1-rc.0',
          },
          '@babylonlabs-io/ts-sdk': {
            currentVersion: '0.63.0',
            newVersion: '0.63.1-rc.0',
          },
        },
        { preid: 'rc' }
      )
    ).toEqual([
      '@babylonlabs-io/babylon-tbv-rust-wasm',
      '@babylonlabs-io/ts-sdk',
    ]);
  });
});
