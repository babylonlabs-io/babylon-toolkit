import {
  PUBLISHED_DEPENDENCY_SECTIONS,
  assertSiblingIsInstallable,
  assertVersionWasReleased,
  findSiblingPinViolations,
  findSurvivingLocalProtocols,
  formatViolations,
  isExactVersion,
  pinSiblingDependencies,
  type PackageManifest,
  type SiblingRelease,
} from './manifest.js';
import type { RegistryClient } from './registry.js';
import { latestStableVersion, type ReleaseTagReader } from './releaseTags.js';
import {
  releasePackageForProject,
  type ReleasePackages,
} from './workspace.js';

/** Whatever `releaseVersion` reported, narrowed to what this module needs. */
export interface ProjectVersions {
  readonly currentVersion: string;
  readonly newVersion: string | null;
}

export type ProjectsVersionData = Record<string, ProjectVersions>;

/** The version each releasable package will have once this run finishes. */
type ResolvedVersions = ReadonlyMap<string, SiblingRelease>;

export type WriteManifest = (
  manifestPath: string,
  manifest: PackageManifest
) => void;

export interface PinManifestsOptions {
  readonly projectsToPublish: readonly string[];
  readonly projectsVersionData: ProjectsVersionData;
  readonly releasePackages: ReleasePackages;
  readonly registry: RegistryClient;
  readonly releaseTags: ReleaseTagReader;
  readonly writeManifest: WriteManifest;
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
  registry,
  releaseTags,
  writeManifest,
  dryRun,
}: PinManifestsOptions): Promise<void> => {
  const publishing = new Set(
    projectsToPublish.map(
      (projectName) =>
        releasePackageForProject(releasePackages, projectName).packageName
    )
  );

  const resolvedVersions = resolveReleasedVersions(
    projectsVersionData,
    releasePackages,
    publishing
  );

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
        consumerName: packageName,
        manifest,
        releasePackages,
        resolvedVersions,
        releaseTags,
      });

      const pinned = pinSiblingDependencies(manifest, siblings);

      const violations = [
        ...findSiblingPinViolations(pinned.manifest, siblings),
        // Independent of sibling discovery on purpose: a dependency the driver
        // failed to recognise would otherwise ship its local protocol verbatim.
        ...findSurvivingLocalProtocols(pinned.manifest),
      ];
      if (violations.length > 0) {
        throw new Error(
          formatViolations(packageName, releasePackage.manifestPath, violations)
        );
      }

      for (const sibling of siblings.values()) {
        // Checked before the lookup, not after: a version this run publishes
        // cannot be on the registry yet, and a transient registry error on an
        // answer that would be discarded must not abort the release.
        if (sibling.publishedByThisRun) continue;
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
 * currentVersion` the truthful version of any sibling.
 *
 * Whether that version really came from a tag is checked where it is used as a
 * pin rather than here. A package under the release globs that has never been
 * released has no tag and no truthful version, but it only matters once
 * something published depends on it.
 */
/**
 * `publishedByThisRun` is what suppresses both registry guards for a sibling,
 * so it has to mean "this run will actually publish it" - not "nx gave it a
 * version". The two were the same predicate until the prerelease gate started
 * dropping stable-numbered dependents from the publish set; a dropped project
 * left marked published would have its version pinned into a sibling with no
 * check at all, which is the phantom pin this whole module exists to stop.
 */
const resolveReleasedVersions = (
  projectsVersionData: ProjectsVersionData,
  releasePackages: ReleasePackages,
  publishing: ReadonlySet<string>
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
      publishedByThisRun: publishing.has(packageName),
    });
  }

  return resolved;
};

const resolveSiblings = async ({
  consumerName,
  manifest,
  releasePackages,
  resolvedVersions,
  releaseTags,
}: {
  consumerName: string;
  manifest: PackageManifest;
  releasePackages: ReleasePackages;
  resolvedVersions: ResolvedVersions;
  releaseTags: ReleaseTagReader;
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
          consumerName,
          releasePackages,
          resolvedVersions,
          releaseTags,
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
  releaseTags,
}: {
  packageName: string;
  consumerName: string;
  releasePackages: ReleasePackages;
  resolvedVersions: ResolvedVersions;
  releaseTags: ReleaseTagReader;
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
  if (resolved) {
    if (!resolved.publishedByThisRun) {
      // A version nx did not take from a tag came from the on-disk fallback.
      // `babylon-tbv-rust-wasm`'s on-disk 0.1.0 is real semver and really is on
      // the registry, so it would otherwise pass every other gate here while
      // shipping a build 14 minor versions stale.
      assertVersionWasReleased(
        packageName,
        resolved.version,
        await releaseTags.readReleasedVersions(packageName)
      );
    }
    return resolved;
  }

  // nx filtered this sibling out of the run entirely, which happens on the
  // release-candidate path where only one project is versioned.
  const version = latestStableVersion(
    await releaseTags.readReleasedVersions(packageName)
  );

  if (!version) {
    throw new Error(
      `${consumerName} depends on ${packageName}, but ${packageName} is not part of this release run and has no stable release tag to read a published version from.`
    );
  }
  if (!isExactVersion(version)) {
    throw new Error(
      `${consumerName} depends on ${packageName}, whose latest release tag reads "${version}" - not an exact version, so it cannot be published as a pin.`
    );
  }

  return { packageName, version, publishedByThisRun: false };
};
