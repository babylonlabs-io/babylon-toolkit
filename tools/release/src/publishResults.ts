import type { ProjectsVersionData } from './pinManifests.js';
import { isPrereleaseVersion } from './releaseTags.js';

/** Whatever `releasePublish` reported, narrowed to what this module needs. */
export type PublishResults = Record<string, { code: number } | undefined>;

/**
 * Every project this run is responsible for publishing.
 *
 * A superset of the projects asked for: nx adds out-of-filter dependents
 * through `updateDependents` and bumps them too. Everything downstream has to
 * use this list, or a dependent gets published with no tag and no changelog.
 *
 * On a release-candidate run that superset is not safe to publish as-is. nx
 * bumps a dragged-in dependent with a hardcoded `patch` that ignores the
 * preid, so dispatching an RC for a package that has dependents would publish
 * a stable-numbered dependent pinned to the prerelease, and git-tag it on the
 * stable line - which a later stable run then resolves from and never
 * republishes, leaving a permanent hole. Dist-tags do not constrain semver
 * range resolution, so `next` would not keep that build away from consumers.
 * A prerelease run publishes prereleases or nothing.
 */
export const selectProjectsToPublish = (
  projectsVersionData: ProjectsVersionData,
  { preid }: { preid: string | undefined }
): string[] =>
  Object.entries(projectsVersionData)
    .filter(
      ([, project]) =>
        project.newVersion !== null &&
        (preid === undefined || isPrereleaseVersion(project.newVersion))
    )
    .map(([projectName]) => projectName);

export interface PublishableProject {
  readonly projectName: string;
  readonly packageName: string;
  readonly isPrivate: boolean;
}

/**
 * nx only attaches a publish target to a package that is not private, and
 * `releasePublish` drops any project without that target while still reporting
 * success. That is how a signer version got versioned, tagged and pinned by
 * wallet-connector without ever being published.
 *
 * Checked before publishing rather than inferred from the results afterwards:
 * a project can also be missing from the results because nx skipped it when one
 * of its dependencies failed, which is a different problem with a different fix.
 */
export const assertProjectsArePublishable = (
  projects: readonly PublishableProject[]
): void => {
  const unpublishable = projects.filter((project) => project.isPrivate);
  if (unpublishable.length === 0) return;

  throw new Error(
    `These projects are part of the release but are marked "private", so nx will version and tag them without ever publishing them: ${unpublishable
      .map((project) => project.packageName)
      .join(', ')}. Anything depending on one would pin a version that will never exist. Make them publishable or take them out of the release set.`
  );
};

/**
 * A project is only released once its publish reports success. A project with no
 * result at all was skipped, which nx does when one of its dependencies failed -
 * the dependency's own non-zero result is the root cause, and this reports the
 * dependent so the operator knows it did not ship either.
 *
 * Under a dry run nothing writes the new version to disk, so every publish packs
 * the previous release and fails on it, taking its dependents down as skips.
 * That says nothing about whether a real release would work.
 */
export const assertEveryProjectPublished = (
  projectsToPublish: readonly string[],
  publishResults: PublishResults,
  { dryRun }: { dryRun: boolean }
): void => {
  const failed = projectsToPublish.filter(
    (projectName) => publishResults[projectName]?.code !== 0
  );

  if (failed.length === 0) return;

  const summary = `These projects were versioned but did not publish: ${failed.join(', ')}.`;

  if (dryRun) {
    console.warn(
      `${summary} Expected during a dry run, which packs the previous release because the new versions are never written to disk.`
    );
    return;
  }

  throw new Error(
    `${summary} No git tags were created. Any package that did publish is already immutable on the registry, so check which ones landed before re-running - the publish executor skips a version it finds already published.`
  );
};
