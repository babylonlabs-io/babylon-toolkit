import {
  PUBLISHED_DEPENDENCY_SECTIONS,
  assertSiblingIsInstallable,
  findSiblingPinViolations,
  formatViolations,
  isExactVersion,
  pinSiblingDependencies,
  type PackageManifest,
  type SiblingRelease,
} from './manifest.js';
import { execCommand } from './exec.js';
import type { RegistryClient } from './registry.js';
import {
  releasePackageForProject,
  writeManifest,
  type ReleaseConfig,
  type ReleasePackages,
} from './workspace.js';

const RELEASE_TAG_VERSION_PLACEHOLDER = '{version}';
const RELEASE_TAG_PROJECT_PLACEHOLDER = '{projectName}';

/** Whatever `releaseVersion` reported, narrowed to what this module needs. */
export interface ProjectVersions {
  readonly currentVersion: string;
  readonly newVersion: string | null;
}

export type ProjectsVersionData = Record<string, ProjectVersions>;

/** The version each releasable package will have once this run finishes. */
type ResolvedVersions = ReadonlyMap<string, SiblingRelease>;

export interface PinManifestsOptions {
  readonly projectsToPublish: readonly string[];
  readonly projectsVersionData: ProjectsVersionData;
  readonly releasePackages: ReleasePackages;
  readonly releaseConfig: ReleaseConfig;
  readonly registry: RegistryClient;
  readonly dryRun: boolean;
}

/**
 * Writes the version every releasable package will have, then replaces each
 * local-protocol dependency on a sibling with that sibling's real version, so
 * the manifest on disk is exactly what gets published.
 *
 * Without this, `pnpm publish` substitutes `workspace:*` from the sibling's
 * on-disk version, which is frozen fiction because version bumps are never
 * committed back to git.
 *
 * Nothing is written under `dryRun`, but every check still runs against the
 * same in-memory manifest, so a dry run verifies the bytes a real run publishes.
 *
 * Callers must not run `pnpm install` after this: rewriting a dependency spec
 * makes the `specifier` recorded in pnpm-lock.yaml stale for the rest of the job.
 */
export const materializeAndPinManifests = async ({
  projectsToPublish,
  projectsVersionData,
  releasePackages,
  releaseConfig,
  registry,
  dryRun,
}: PinManifestsOptions): Promise<void> => {
  const resolvedVersions = resolveReleasedVersions(
    projectsVersionData,
    releasePackages
  );
  const publishing = new Set(projectsToPublish);

  for (const [packageName, releasePackage] of releasePackages) {
    const changes: string[] = [];
    let manifest = releasePackage.manifest;

    const resolved = resolvedVersions.get(packageName);
    if (resolved && manifest.version !== resolved.version) {
      changes.push(`version ${manifest.version} -> ${resolved.version}`);
      manifest = { ...manifest, version: resolved.version };
    }

    if (publishing.has(packageName)) {
      const siblings = await resolveSiblings({
        manifest,
        releasePackages,
        resolvedVersions,
        releaseTagPattern: releaseConfig.releaseTagPattern,
      });

      const pinned = pinSiblingDependencies(manifest, siblings);
      const violations = findSiblingPinViolations(pinned.manifest, siblings);
      if (violations.length > 0) {
        throw new Error(
          formatViolations(packageName, releasePackage.manifestPath, violations)
        );
      }

      for (const sibling of siblings.values()) {
        assertSiblingIsInstallable(
          sibling,
          await registry.fetchPublishedVersions(sibling.packageName)
        );
      }

      changes.push(
        ...pinned.rewrites.map(
          (rewrite) =>
            `${rewrite.section}.${rewrite.dependencyName} ${rewrite.from} -> ${rewrite.to}`
        )
      );
      manifest = pinned.manifest;
    }

    if (changes.length === 0) continue;

    console.log(
      `${dryRun ? '[dry-run] would update' : 'Updated'} ${releasePackage.manifestPath}`
    );
    for (const change of changes) {
      console.log(`  ${change}`);
    }
    if (!dryRun) {
      writeManifest(releasePackage.manifestPath, manifest);
    }
  }
};

/**
 * nx resolves every release-set project's current version from its git tag, and
 * reports it for projects it is not bumping too. That makes `newVersion ??
 * currentVersion` the truthful version of any sibling, with no registry lookup.
 */
const resolveReleasedVersions = (
  projectsVersionData: ProjectsVersionData,
  releasePackages: ReleasePackages
): ResolvedVersions => {
  const resolved = new Map<string, SiblingRelease>();

  for (const [projectName, versions] of Object.entries(projectsVersionData)) {
    const { packageName } = releasePackageForProject(
      releasePackages,
      projectName
    );
    resolved.set(packageName, {
      packageName,
      version: versions.newVersion ?? versions.currentVersion,
      publishedByThisRun: versions.newVersion !== null,
    });
  }

  return resolved;
};

const resolveSiblings = async ({
  manifest,
  releasePackages,
  resolvedVersions,
  releaseTagPattern,
}: {
  manifest: PackageManifest;
  releasePackages: ReleasePackages;
  resolvedVersions: ResolvedVersions;
  releaseTagPattern: string;
}): Promise<ReadonlyMap<string, SiblingRelease>> => {
  const siblings = new Map<string, SiblingRelease>();

  for (const section of PUBLISHED_DEPENDENCY_SECTIONS) {
    for (const dependencyName of Object.keys(manifest[section] ?? {})) {
      if (!releasePackages.has(dependencyName) || siblings.has(dependencyName)) {
        continue;
      }
      siblings.set(
        dependencyName,
        await resolveSibling({
          packageName: dependencyName,
          consumerName: manifest.name ?? '(unnamed package)',
          releasePackages,
          resolvedVersions,
          releaseTagPattern,
        })
      );
    }
  }

  return siblings;
};

const resolveSibling = async ({
  packageName,
  consumerName,
  releasePackages,
  resolvedVersions,
  releaseTagPattern,
}: {
  packageName: string;
  consumerName: string;
  releasePackages: ReleasePackages;
  resolvedVersions: ResolvedVersions;
  releaseTagPattern: string;
}): Promise<SiblingRelease> => {
  const siblingPackage = releasePackageForProject(releasePackages, packageName);

  /**
   * nx only attaches the publish target to packages that are not private, and
   * silently drops the rest from the publish run while still versioning and
   * tagging them. A public package depending on one would ship a pin to a
   * version that is never going to exist.
   */
  if (siblingPackage.manifest.private) {
    throw new Error(
      `${consumerName} is published but depends on the private workspace package ${packageName}. nx never publishes a private package, so the pin would reference a version that does not exist. Make ${packageName} publishable or drop the dependency.`
    );
  }

  const resolved = resolvedVersions.get(packageName);
  const version =
    resolved?.version ??
    (await latestReleasedVersionFromGitTags(packageName, releaseTagPattern));

  if (!version) {
    throw new Error(
      `${consumerName} depends on ${packageName}, but ${packageName} is not part of this release run and has no release tag to read a published version from.`
    );
  }
  if (!isExactVersion(version)) {
    throw new Error(
      `${consumerName} depends on ${packageName}, which resolved to "${version}" - not an exact version, so it cannot be published as a pin.`
    );
  }

  return {
    packageName,
    version,
    publishedByThisRun: resolved?.publishedByThisRun ?? false,
  };
};

/**
 * Used when nx filtered a sibling out of the run entirely, which happens on the
 * release-candidate path where only one project is versioned.
 */
const latestReleasedVersionFromGitTags = async (
  projectName: string,
  releaseTagPattern: string
): Promise<string | undefined> => {
  if (!releaseTagPattern.endsWith(RELEASE_TAG_VERSION_PLACEHOLDER)) {
    throw new Error(
      `The release driver can only read versions back from a releaseTagPattern ending in "${RELEASE_TAG_VERSION_PLACEHOLDER}", but nx.json has "${releaseTagPattern}".`
    );
  }

  const prefix = releaseTagPattern
    .slice(0, -RELEASE_TAG_VERSION_PLACEHOLDER.length)
    .replace(RELEASE_TAG_PROJECT_PLACEHOLDER, projectName);

  const tags = await execCommand('git', [
    'tag',
    '--list',
    `${prefix}*`,
    '--sort=-v:refname',
  ]);

  return tags
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .find(
      // git's version sort ranks 1.0.0-rc.1 above 1.0.0, and a stable dependent
      // must never pin a prerelease.
      (version) => isExactVersion(version) && !version.includes('-')
    );
};
