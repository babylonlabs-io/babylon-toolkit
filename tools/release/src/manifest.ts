/**
 * Pure manifest transforms used by the release driver. No filesystem, no
 * network, no nx imports - everything here is a function of its arguments so
 * the release-blocking rules can be tested directly.
 */

/**
 * The manifest sections a consumer resolves when it installs the package.
 * `devDependencies` is deliberately absent: consumers never install them, and
 * every package here carries `@internal/eslint-config` there as `workspace:*`.
 */
export const PUBLISHED_DEPENDENCY_SECTIONS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export type PublishedDependencySection =
  (typeof PUBLISHED_DEPENDENCY_SECTIONS)[number];

/**
 * Specs that only resolve against the local checkout. None of them can be
 * resolved by a consumer installing from a registry.
 */
export const LOCAL_DEPENDENCY_PROTOCOLS = [
  'workspace:',
  'file:',
  'link:',
  'portal:',
] as const;

/**
 * The version nx writes when `fallbackCurrentVersionResolver: "disk"` fires
 * because no git tag matched, plus anything else in the 0.0.0 placeholder
 * family. Publishing a pin to one of these is how
 * `wallet-connector@1.67.2` came to reference a version that does not exist.
 */
const PLACEHOLDER_VERSION_PATTERN = /^0\.0\.0(?:[-+]|$)/;

/** The official semver.org "is a single concrete version" expression. */
const EXACT_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** A spec that resolves to whatever the registry currently calls newest. */
const WILDCARD_SPEC = '*';

export interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** A release-set package as consumers will see it once this run finishes. */
export interface SiblingRelease {
  readonly packageName: string;
  readonly version: string;
  /**
   * True when this run publishes `version`. When false, `version` must already
   * be on the registry for a dependent pinning it to be installable.
   */
  readonly publishedByThisRun: boolean;
}

export type SiblingReleases = ReadonlyMap<string, SiblingRelease>;

export interface DependencyRewrite {
  readonly section: PublishedDependencySection;
  readonly dependencyName: string;
  readonly from: string;
  readonly to: string;
}

export interface ManifestViolation {
  readonly section: PublishedDependencySection;
  readonly dependencyName: string;
  readonly spec: string;
  readonly reason: string;
}

export const isLocalDependencySpec = (spec: string): boolean =>
  LOCAL_DEPENDENCY_PROTOCOLS.some((protocol) => spec.startsWith(protocol));

export const isExactVersion = (spec: string): boolean =>
  EXACT_VERSION_PATTERN.test(spec);

export const isPlaceholderVersion = (version: string): boolean =>
  PLACEHOLDER_VERSION_PATTERN.test(version);

/**
 * A copy of `manifest` with every local-protocol spec that targets a release
 * sibling replaced by that sibling's exact version. The input is not mutated.
 *
 * A bare `*` is left alone on purpose: it is a legal npm range rather than a
 * local protocol, so rewriting it would be guessing at intent. It is rejected
 * by `findSiblingPinViolations` instead.
 */
export const pinSiblingDependencies = (
  manifest: PackageManifest,
  siblings: SiblingReleases
): { manifest: PackageManifest; rewrites: DependencyRewrite[] } => {
  const rewrites: DependencyRewrite[] = [];
  const pinned: PackageManifest = { ...manifest };

  for (const section of PUBLISHED_DEPENDENCY_SECTIONS) {
    const specs = manifest[section];
    if (!specs) continue;

    const pinnedSpecs = { ...specs };
    for (const [dependencyName, spec] of Object.entries(specs)) {
      const sibling = siblings.get(dependencyName);
      if (!sibling || !isLocalDependencySpec(spec)) continue;

      pinnedSpecs[dependencyName] = sibling.version;
      rewrites.push({
        section,
        dependencyName,
        from: spec,
        to: sibling.version,
      });
    }
    pinned[section] = pinnedSpecs;
  }

  return { manifest: pinned, rewrites };
};

/**
 * Every reason a sibling spec would be wrong once published. An empty array
 * means the manifest is safe to publish.
 *
 * The test is equality against the version this run resolved, not merely that
 * the pinned version exists - `babylon-tbv-rust-wasm@0.1.0` exists and is the
 * exact value that shipped broken for months.
 */
export const findSiblingPinViolations = (
  manifest: PackageManifest,
  siblings: SiblingReleases
): ManifestViolation[] => {
  const violations: ManifestViolation[] = [];

  for (const section of PUBLISHED_DEPENDENCY_SECTIONS) {
    const specs = manifest[section];
    if (!specs) continue;

    for (const [dependencyName, spec] of Object.entries(specs)) {
      const sibling = siblings.get(dependencyName);
      if (!sibling) continue;

      const reason = findSpecViolationReason(spec, sibling);
      if (reason) {
        violations.push({ section, dependencyName, spec, reason });
      }
    }
  }

  return violations;
};

const findSpecViolationReason = (
  spec: string,
  sibling: SiblingRelease
): string | null => {
  if (isLocalDependencySpec(spec)) {
    return `still uses the local protocol "${spec}" - a consumer installing from the registry cannot resolve it`;
  }
  if (spec === WILDCARD_SPEC) {
    return `is "${WILDCARD_SPEC}", which floats to whatever version is newest rather than the one this release was built against`;
  }
  if (!isExactVersion(spec)) {
    return `is "${spec}", which is not an exact version - releases pin workspace siblings exactly`;
  }
  if (isPlaceholderVersion(sibling.version)) {
    return `resolves ${sibling.packageName} to the placeholder version "${sibling.version}". nx fell back to the on-disk package.json because no git tag matched, so this pin would reference a version that was never published`;
  }
  if (spec !== sibling.version) {
    return `pins "${spec}" but this release resolves ${sibling.packageName} to ${sibling.version}`;
  }
  return null;
};

/**
 * Guards the case where a git tag exists but the matching publish never landed,
 * which nx can never repair on its own because it only rolls forward from tags.
 *
 * `publishedVersions` is null when the registry has no such package at all.
 */
export const assertSiblingIsInstallable = (
  sibling: SiblingRelease,
  publishedVersions: readonly string[] | null
): void => {
  if (sibling.publishedByThisRun) return;

  if (publishedVersions === null) {
    throw new Error(
      `${sibling.packageName} is pinned at ${sibling.version} but has never been published. Publish it before publishing anything that depends on it.`
    );
  }

  if (!publishedVersions.includes(sibling.version)) {
    throw new Error(
      `${sibling.packageName}@${sibling.version} is pinned by this release but does not exist on the registry. A git tag for it exists without a matching published version, which means that publish failed or was skipped. Re-run the release for ${sibling.packageName} before releasing anything that depends on it.`
    );
  }
};

export const formatViolations = (
  packageName: string,
  manifestPath: string,
  violations: readonly ManifestViolation[]
): string =>
  [
    `${packageName} cannot be published: its manifest would ship sibling versions a consumer cannot resolve.`,
    ...violations.map(
      (violation) =>
        `  - ${violation.section}.${violation.dependencyName} ${violation.reason}`
    ),
    `Fix the specs in ${manifestPath} (syncpack pins local packages to "workspace:*") and re-run the release.`,
  ].join('\n');
