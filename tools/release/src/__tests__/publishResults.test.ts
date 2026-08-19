import { describe, expect, it, vi } from 'vitest';

import { assertEveryProjectPublished } from '../publishResults.js';

describe('assertEveryProjectPublished', () => {
  it('fails when nx never ran a publish for a project it versioned', () => {
    // nx silently drops any package without a publish target, which is every
    // package marked private. Checking exit codes alone passes vacuously.
    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/wallet-connector', '@babylonlabs-io/ledger-vault-signer'],
        { '@babylonlabs-io/wallet-connector': { code: 0 } },
        { dryRun: false }
      )
    ).toThrow('@babylonlabs-io/ledger-vault-signer');
  });

  it('fails on a dropped project during a dry run too, because the drop is just as real', () => {
    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/ledger-vault-signer'],
        {},
        { dryRun: true }
      )
    ).toThrow('never ran a publish');
  });

  it('fails when a publish exits non-zero', () => {
    expect(() =>
      assertEveryProjectPublished(
        ['@babylonlabs-io/ts-sdk'],
        { '@babylonlabs-io/ts-sdk': { code: 1 } },
        { dryRun: false }
      )
    ).toThrow('did not publish successfully');
  });

  it('tolerates a non-zero exit during a dry run, which packs the previous release', () => {
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
