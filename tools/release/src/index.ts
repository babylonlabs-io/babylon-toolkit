import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';

import { execCommand } from './exec.js';
import { materializeAndPinManifests } from './pinManifests.js';
import { createRegistryClient } from './registry.js';
import { readReleaseConfig, readReleasePackages } from './workspace.js';

const DRY_RUN = process.env.DRY_RUN === 'true';

/** Comma-separated nx project names. Empty releases the whole set, which is the main-branch behaviour. */
const RELEASE_PROJECTS = (process.env.RELEASE_PROJECTS ?? '')
  .split(',')
  .map((project) => project.trim())
  .filter(Boolean);

/** Set by the release-candidate path to force a prerelease bump. */
const RELEASE_SPECIFIER = process.env.RELEASE_SPECIFIER || undefined;
const RELEASE_PREID = process.env.RELEASE_PREID || undefined;

/** npm dist-tag. Undefined leaves nx's default of "latest". */
const RELEASE_DIST_TAG = process.env.RELEASE_DIST_TAG || undefined;

const WORKSPACE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

/** `nx/release` exports no result types, so they are derived from its functions. */
type PublishResults = Awaited<ReturnType<typeof releasePublish>>;

const release = async () => {
  const { workspaceVersion, projectsVersionData } = await releaseVersion({
    projects: RELEASE_PROJECTS.length > 0 ? RELEASE_PROJECTS : undefined,
    specifier: RELEASE_SPECIFIER,
    preid: RELEASE_PREID,
    gitCommit: false,
    gitTag: false,
    gitPush: false,
    verbose: true,
    dryRun: DRY_RUN,
  });

  const projectsToPublish = Object.entries(projectsVersionData)
    .filter(([, project]) => project.newVersion !== null)
    .map(([projectName]) => projectName);

  if (projectsToPublish.length === 0) {
    console.log('No project release needed');
    process.exit(0);
  }

  const releaseConfig = readReleaseConfig(WORKSPACE_ROOT);
  const releasePackages = readReleasePackages(
    WORKSPACE_ROOT,
    releaseConfig.projectGlobs
  );

  await materializeAndPinManifests({
    projectsToPublish,
    projectsVersionData,
    releasePackages,
    releaseConfig,
    registry: createRegistryClient(releaseConfig.registryUrl),
    dryRun: DRY_RUN,
  });

  const publishResults = await releasePublish({
    dryRun: DRY_RUN,
    projects: projectsToPublish,
    tag: RELEASE_DIST_TAG,
    verbose: true,
  });

  assertEveryProjectPublished(projectsToPublish, publishResults, DRY_RUN);

  /**
   * Tagging runs only after a fully successful publish. The other order leaves a
   * tag for a version that was never published, and because nx only ever rolls
   * forward from tags that version can never be published afterwards - which is
   * how `wallet-connector@1.66.1` came to pin a permanent 404.
   */
  await releaseChangelog({
    // Must match the filter releaseVersion ran with: releaseChangelog reads a
    // version for every project it is asked about and throws on a gap.
    projects: RELEASE_PROJECTS.length > 0 ? RELEASE_PROJECTS : undefined,
    dryRun: DRY_RUN,
    versionData: projectsVersionData,
    version: workspaceVersion,
    gitCommit: false,
    gitTag: true,
    gitPush: false,
    // Prereleases get a tag but no GitHub release, matching what the RC path did before.
    createRelease: RELEASE_PREID ? false : undefined,
    verbose: true,
  });

  /**
   * We intentionally not commit all the version changes but only push the tags
   */
  if (!DRY_RUN) {
    await pushReleaseTags();
  }
};

/**
 * A project with no entry in the results was dropped before the executor ran -
 * nx does that silently for any package without a publish target, which is every
 * package marked private. Checking only the exit codes passes vacuously then.
 */
const assertEveryProjectPublished = (
  projectsToPublish: readonly string[],
  publishResults: PublishResults,
  dryRun: boolean
): void => {
  const failed = projectsToPublish.filter(
    (projectName) => publishResults[projectName]?.code !== 0
  );

  if (failed.length === 0) return;

  const summary = `These projects were versioned but did not publish successfully: ${failed.join(', ')}.`;

  /**
   * A dry run never writes the new version to disk, so `pnpm publish
   * --dry-run` reads the previous one and reports it as already published.
   * That says nothing about whether a real release would work.
   */
  if (dryRun) {
    console.warn(`${summary} Expected during a dry run, which does not write the new versions to disk.`);
    return;
  }

  // When a publish target fails, we want to fail the CI
  console.error(
    `${summary} No git tags were created, so re-running the release will retry the same versions.`
  );
  process.exit(1);
};

const pushReleaseTags = async () => {
  const commandArgs = [
    'push',
    // NOTE: It's important we use --follow-tags, and not --tags, so that we are precise about what we are pushing
    '--follow-tags',
    '--no-verify',
    '--atomic',
  ];

  console.log(
    'Pushing the current branch to the remote with the following command:'
  );
  console.log(`git ${commandArgs.join(' ')}`);

  try {
    await execCommand('git', commandArgs);
  } catch (error) {
    /**
     * Tags for a GitHub release already reach the remote through the releases
     * API, so this push is usually a no-op. Everything of value has been
     * published by this point, and failing here would report a successful
     * release as broken.
     */
    console.warn(`Could not push to the remote: ${error}`);
  }
};

release().catch((error) => {
  console.error(error);
  process.exit(1);
});
