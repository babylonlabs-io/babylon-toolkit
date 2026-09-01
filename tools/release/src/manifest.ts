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
const LOCAL_DEPENDENCY_PROTOCOLS = [
  'workspace:',
  'file:',
  'link:',
  'portal:',
] as const;

const WORKSPACE_PROTOCOL = 'workspace:';

/**
 * The workspace ranges pnpm can substitute, mapped to the semver prefix they
 * become. Anything else - `workspace:^1.2.3`, `file:`, `link:` - is left alone
 * and reported, rather than guessed at.
 */
const WORKSPACE_RANGE_PREFIXES: Readonly<Record<string, string>> = {
  '*': '',
  '^': '^',
  '~': '~',
};

/** A prefix a pinned spec may legitimately carry once resolved. */
const ACCEPTED_RANGE_PREFIXES = ['^', '~'] as const;

/**
 * The version nx writes when `fallbackCurrentVersionResolver: "disk"` fires
 * because no git tag matched, plus the rest of the 0.0.0 placeholder family.
 * This only catches placeholders that look like placeholders - the check that
 * a resolved version is genuinely a released one is `assertVersionWasReleased`.
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
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
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

/**
 * Which rule rejected a spec. Tests assert on this rather than on the prose, so
 * an error message can be reworded without breaking them.
 */
export type ViolationCode =
  | 'local-protocol'
  | 'wildcard'
  | 'inexact'
  | 'placeholder'
  | 'mismatch';

export interface ManifestViolation {
  readonly code: ViolationCode;
  readonly section: PublishedDependencySection;
  readonly dependencyName: string;
  readonly spec: string;
  readonly reason: string;
}

const isLocalDependencySpec = (spec: string): boolean =>
  LOCAL_DEPENDENCY_PROTOCOLS.some((protocol) => spec.startsWith(protocol));

export const isExactVersion = (spec: string): boolean =>
  EXACT_VERSION_PATTERN.test(spec);

const isPlaceholderVersion = (version: string): boolean =>
  PLACEHOLDER_VERSION_PATTERN.test(version);

/**
 * The spec a `workspace:` range becomes once resolved, preserving the range the
 * author asked for. Returns null for a local protocol carrying no range this
 * can translate, which is then reported rather than rewritten.
 */
export const resolveLocalDependencySpec = (
  spec: string,
  version: string
): string | null => {
  if (!spec.startsWith(WORKSPACE_PROTOCOL)) return null;

  const range = spec.slice(WORKSPACE_PROTOCOL.length);
  const prefix = WORKSPACE_RANGE_PREFIXES[range];
  return prefix === undefined ? null : `${prefix}${version}`;
};

/**
 * A copy of `manifest` with every local-protocol spec that targets a release
 * sibling replaced by that sibling's version. The input is not mutated.
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

      const resolved = resolveLocalDependencySpec(spec, sibling.version);
      if (resolved === null) continue;

      pinnedSpecs[dependencyName] = resolved;
      rewrites.push({ section, dependencyName, from: spec, to: resolved });
    }
    pinned[section] = pinnedSpecs;
  }

  return { manifest: pinned, rewrites };
};

/**
 * Every reason a sibling spec would be wrong once published. An empty array
 * means the sibling pins are safe.
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

      const violation = findSpecViolation(spec, sibling);
      if (violation) {
        violations.push({ ...violation, section, dependencyName, spec });
      }
    }
  }

  return violations;
};

/**
 * Any local protocol still present in a published section, whether or not it
 * targets a release sibling. This is deliberately independent of package
 * discovery: a dependency the driver failed to recognise as a sibling would
 * otherwise be neither rewritten nor reported, and would ship verbatim.
 */
export const findSurvivingLocalProtocols = (
  manifest: PackageManifest
): ManifestViolation[] => {
  const violations: ManifestViolation[] = [];

  for (const section of PUBLISHED_DEPENDENCY_SECTIONS) {
    for (const [dependencyName, spec] of Object.entries(
      manifest[section] ?? {}
    )) {
      if (!isLocalDependencySpec(spec)) continue;
      violations.push({
        code: 'local-protocol',
        section,
        dependencyName,
        spec,
        reason: `still uses the local protocol "${spec}" - a consumer installing from the registry cannot resolve it. Only "workspace:*", "workspace:^" and "workspace:~" on a releasable package can be resolved automatically.`,
      });
    }
  }

  return violations;
};

const findSpecViolation = (
  spec: string,
  sibling: SiblingRelease
): Pick<ManifestViolation, 'code' | 'reason'> | null => {
  if (isLocalDependencySpec(spec)) {
    return {
      code: 'local-protocol',
      reason: `still uses the local protocol "${spec}" - a consumer installing from the registry cannot resolve it`,
    };
  }
  if (spec === WILDCARD_SPEC) {
    return {
      code: 'wildcard',
      reason: `is "${WILDCARD_SPEC}", which floats to whatever version is newest rather than the one this release was built against`,
    };
  }

  const prefix = ACCEPTED_RANGE_PREFIXES.find((candidate) =>
    spec.startsWith(candidate)
  );
  const version = prefix ? spec.slice(prefix.length) : spec;

  if (!isExactVersion(version)) {
    return {
      code: 'inexact',
      reason: `is "${spec}", which does not name a single version - releases pin workspace siblings at the version they were built against`,
    };
  }
  if (isPlaceholderVersion(sibling.version)) {
    return {
      code: 'placeholder',
      reason: `resolves ${sibling.packageName} to the placeholder version "${sibling.version}". nx fell back to the on-disk package.json because no git tag matched, so this pin would reference a version that was never published`,
    };
  }
  if (version !== sibling.version) {
    return {
      code: 'mismatch',
      reason: `pins "${spec}" but this release resolves ${sibling.packageName} to ${sibling.version}`,
    };
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
      `${sibling.packageName}@${sibling.version} is pinned by this release but does not exist on the registry. A git tag for it exists without a matching published version, which means that publish failed or was skipped. Bump ${sibling.packageName} in this release so it publishes alongside its dependents, or publish ${sibling.version} by hand.`
    );
  }
};

/**
 * Detects nx falling back to the on-disk version because no git tag matched.
 * Checking the tag list directly catches the dangerous case a version-shaped
 * heuristic cannot: `babylon-tbv-rust-wasm`'s on-disk `0.1.0` is real semver
 * and really is on the registry, so pinning it would pass every other gate
 * while shipping a build 14 minor versions stale.
 */
export const assertVersionWasReleased = (
  packageName: string,
  version: string,
  releasedVersions: readonly string[]
): void => {
  if (releasedVersions.includes(version)) return;

  throw new Error(
    `${packageName} resolved to version ${version}, which has no release tag. nx fell back to the version on disk in packages/*/package.json, which is not a released version and must never be published as a dependency pin.`
  );
};

export const formatViolations = (
  packageName: string,
  manifestPath: string,
  violations: readonly ManifestViolation[]
): string =>
  [
    `${packageName} cannot be published: its manifest would ship dependency versions a consumer cannot resolve.`,
    ...violations.map(
      (violation) =>
        `  - ${violation.section}.${violation.dependencyName} ${violation.reason}`
    ),
    `Fix the specs in ${manifestPath} (syncpack pins local packages to "workspace:*") and re-run the release.`,
  ].join('\n');
