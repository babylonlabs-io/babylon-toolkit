/**
 * Reads released versions back out of git tags, the way nx itself resolves a
 * project's current version. Kept behind an injectable git runner so the
 * parsing and ordering rules can be tested against a canned tag list.
 */

const RELEASE_TAG_VERSION_PLACEHOLDER = '{version}';
const RELEASE_TAG_PROJECT_PLACEHOLDER = '{projectName}';

const BUILD_METADATA_SEPARATOR = '+';
const PRERELEASE_SEPARATOR = '-';

export type RunGit = (args: readonly string[]) => Promise<string>;

export interface ReleaseTagReader {
  /** Every version this project has a release tag for, newest first. */
  readReleasedVersions(projectName: string): Promise<readonly string[]>;
}

/** The literal text a project's release tags start with, e.g. `@scope/name/`. */
export const releaseTagPrefixFor = (
  releaseTagPattern: string,
  projectName: string
): string => {
  if (!releaseTagPattern.endsWith(RELEASE_TAG_VERSION_PLACEHOLDER)) {
    throw new Error(
      `The release driver can only read versions back from a releaseTagPattern ending in "${RELEASE_TAG_VERSION_PLACEHOLDER}", but nx.json has "${releaseTagPattern}".`
    );
  }

  return releaseTagPattern
    .slice(0, -RELEASE_TAG_VERSION_PLACEHOLDER.length)
    .replace(RELEASE_TAG_PROJECT_PLACEHOLDER, projectName);
};

export const parseReleasedVersions = (
  gitTagOutput: string,
  prefix: string
): readonly string[] =>
  gitTagOutput
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .filter(Boolean);

/**
 * Build metadata may itself contain a hyphen, so it has to come off before
 * looking for the prerelease separator.
 */
export const isPrereleaseVersion = (version: string): boolean =>
  version.split(BUILD_METADATA_SEPARATOR)[0].includes(PRERELEASE_SEPARATOR);

/**
 * A stable dependent must never pin a prerelease of a sibling, and git's
 * version sort ranks `1.0.0-rc.1` above `1.0.0` unless told otherwise.
 */
export const latestStableVersion = (
  versions: readonly string[]
): string | undefined => versions.find((version) => !isPrereleaseVersion(version));

/**
 * Matches how nx resolves the same tags (`utils/git.js`): prereleases sort
 * below their release, only tags reachable from the current branch count, and
 * `--merged` goes last because it swallows the token after it.
 */
const listTagArgs = (prefix: string, mergedOnly: boolean): readonly string[] => [
  '-c',
  'versionsort.suffix=-',
  'tag',
  '--sort',
  '-v:refname',
  '--list',
  `${prefix}*`,
  ...(mergedOnly ? ['--merged'] : []),
];

const readVersions = async (
  runGit: RunGit,
  prefix: string
): Promise<readonly string[]> => {
  const merged = parseReleasedVersions(
    await runGit(listTagArgs(prefix, true)),
    prefix
  );
  if (merged.length > 0) return merged;

  // Same fallback nx applies: a detached HEAD or a branch cut before the tag
  // sees nothing as merged, and resolving no version at all is worse than
  // resolving one from another branch.
  return parseReleasedVersions(await runGit(listTagArgs(prefix, false)), prefix);
};

export const createReleaseTagReader = (
  releaseTagPattern: string,
  runGit: RunGit
): ReleaseTagReader => {
  const cache = new Map<string, Promise<readonly string[]>>();

  return {
    readReleasedVersions(projectName) {
      const cached = cache.get(projectName);
      if (cached) return cached;

      const prefix = releaseTagPrefixFor(releaseTagPattern, projectName);
      const pending = readVersions(runGit, prefix);

      cache.set(projectName, pending);
      return pending;
    },
  };
};
