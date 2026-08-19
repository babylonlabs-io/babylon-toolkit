import { describe, expect, it, vi } from 'vitest';

import {
  assertEveryProjectPublished,
  assertProjectsArePublishable,
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
