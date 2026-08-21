import { describe, expect, it, vi } from 'vitest';

import {
  createReleaseTagReader,
  isPrereleaseVersion,
  latestStableVersion,
  parseReleasedVersions,
  releaseTagPrefixFor,
} from '../releaseTags.js';

const TAG_PATTERN = '{projectName}/{version}';

describe('releaseTagPrefixFor', () => {
  it('builds the literal text a project\'s tags start with', () => {
    expect(releaseTagPrefixFor(TAG_PATTERN, '@babylonlabs-io/ts-sdk')).toBe(
      '@babylonlabs-io/ts-sdk/'
    );
  });

  it('refuses a tag pattern it cannot read a version back out of', () => {
    expect(() => releaseTagPrefixFor('v{version}-{projectName}', '@scope/pkg')).toThrow(
      'releaseTagPattern'
    );
  });
});

describe('parseReleasedVersions', () => {
  it('strips the prefix and drops anything that does not carry it', () => {
    const versions = parseReleasedVersions(
      [
        '@babylonlabs-io/ts-sdk/0.63.0',
        '@babylonlabs-io/ts-sdk/0.62.1',
        'fm-vault-testnet-abc123',
        '',
      ].join('\n'),
      '@babylonlabs-io/ts-sdk/'
    );

    expect(versions).toEqual(['0.63.0', '0.62.1']);
  });
});

describe('isPrereleaseVersion', () => {
  it('treats a hyphen in the version as a prerelease', () => {
    expect(isPrereleaseVersion('1.0.0-rc.1')).toBe(true);
  });

  it('does not mistake build metadata containing a hyphen for a prerelease', () => {
    expect(isPrereleaseVersion('1.0.0+build-1')).toBe(false);
  });
});

describe('latestStableVersion', () => {
  it('skips prereleases, which a stable dependent must never pin', () => {
    expect(latestStableVersion(['1.109.0-rc.0', '1.108.1', '1.108.0'])).toBe(
      '1.108.1'
    );
  });

  it('returns undefined when the project has no stable release', () => {
    expect(latestStableVersion(['1.0.0-rc.0'])).toBeUndefined();
  });
});

describe('createReleaseTagReader', () => {
  it('asks git for that project\'s tags, newest first and reachable from HEAD', async () => {
    const runGit = vi.fn(async () => '@babylonlabs-io/ts-sdk/0.63.0\n');

    await createReleaseTagReader(TAG_PATTERN, runGit).readReleasedVersions(
      '@babylonlabs-io/ts-sdk'
    );

    expect(runGit).toHaveBeenCalledWith([
      '-c',
      'versionsort.suffix=-',
      'tag',
      '--sort',
      '-v:refname',
      '--list',
      '@babylonlabs-io/ts-sdk/*',
      '--merged',
    ]);
  });

  it('falls back to every branch when nothing is reachable from HEAD', async () => {
    // A detached HEAD or a branch cut before the tag sees nothing as merged,
    // and resolving no version is worse than resolving one from another branch.
    const runGit = vi
      .fn(async () => '@babylonlabs-io/ts-sdk/0.63.0\n')
      .mockImplementationOnce(async () => '');

    const versions = await createReleaseTagReader(
      TAG_PATTERN,
      runGit
    ).readReleasedVersions('@babylonlabs-io/ts-sdk');

    expect(versions).toEqual(['0.63.0']);
    expect(runGit).toHaveBeenLastCalledWith(
      expect.not.arrayContaining(['--merged'])
    );
  });

  it('asks git once per project', async () => {
    const runGit = vi.fn(async () => '@babylonlabs-io/ts-sdk/0.63.0\n');
    const reader = createReleaseTagReader(TAG_PATTERN, runGit);

    await reader.readReleasedVersions('@babylonlabs-io/ts-sdk');
    await reader.readReleasedVersions('@babylonlabs-io/ts-sdk');

    expect(runGit).toHaveBeenCalledTimes(1);
  });
});
