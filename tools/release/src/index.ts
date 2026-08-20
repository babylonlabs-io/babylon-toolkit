import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';

import { execCommand } from './exec.js';
import { materializeAndPinManifests } from './pinManifests.js';
import {
  assertEveryProjectPublished,
  assertProjectsArePublishable,
  selectProjectsToPublish,
} from './publishResults.js';
import { createRegistryClient } from './registry.js';
import { createReleaseTagReader } from './releaseTags.js';
import {
  readReleaseConfig,
  readReleasePackages,
  releasePackageForProject,
  writeManifest,
} from './workspace.js';

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

  const projectsToPublish = selectProjectsToPublish(projectsVersionData, {
    preid: RELEASE_PREID,
  });

  if (projectsToPublish.length === 0) {
    console.log('No project release needed');
    return;
  }

  const releaseConfig = readReleaseConfig(WORKSPACE_ROOT);
  const releasePackages = readReleasePackages(
    WORKSPACE_ROOT,
    releaseConfig.projectGlobs
  );

  assertProjectsArePublishable(
    projectsToPublish.map((projectName) => {
      const { packageName, manifest } = releasePackageForProject(
        releasePackages,
        projectName
      );
      return { projectName, packageName, isPrivate: manifest.private === true };
    })
  );

  await materializeAndPinManifests({
    projectsToPublish,
    projectsVersionData,
    releasePackages,
    registry: createRegistryClient(releaseConfig.registryUrl),
    releaseTags: createReleaseTagReader(releaseConfig.releaseTagPattern, (args) =>
      execCommand('git', [...args])
    ),
    writeManifest,
    dryRun: DRY_RUN,
  });

  const publishResults = await releasePublish({
    dryRun: DRY_RUN,
    projects: projectsToPublish,
    tag: RELEASE_DIST_TAG,
    verbose: true,
  });

  assertEveryProjectPublished(projectsToPublish, publishResults, {
    dryRun: DRY_RUN,
  });

  /**
   * Tagging runs only after a fully successful publish. The other order leaves a
   * tag for a version that was never published, and because nx only ever rolls
   * forward from tags that version can never be published afterwards - which is
   * how `wallet-connector@1.66.1` came to pin a permanent 404.
   */
  try {
    await releaseChangelog({
      projects: projectsToPublish,
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
  } catch (error) {
    // Without this the operator sees only the tagging error and cannot tell
    // that the packages are already immutable on the registry.
    console.error(
      `Tagging failed AFTER a successful publish. These are already on the registry and must not be republished: ${projectsToPublish.join(', ')}. Create their tags by hand rather than re-running the release.`
    );
    throw error;
  }

  /**
   * We intentionally not commit all the version changes but only push the tags
   */
  if (!DRY_RUN) {
    await pushReleaseTags();
  }
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
     * On the stable path nx has already created the tag through the GitHub
     * releases API, so this push is a no-op and failing the job would report a
     * successful release as broken. A prerelease creates no GitHub release, so
     * this push is the only route to the remote: losing it leaves the version
     * on npm untagged, and every later dispatch re-derives the same version and
     * silently no-ops.
     */
    if (RELEASE_PREID) throw error;
    console.warn(`Could not push to the remote: ${error}`);
  }
};

release().catch((error) => {
  console.error(error);
  process.exit(1);
});
