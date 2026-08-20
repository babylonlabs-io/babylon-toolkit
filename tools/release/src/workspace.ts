import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PackageManifest } from './manifest.js';

const MANIFEST_FILE_NAME = 'package.json';
const NX_CONFIG_FILE_NAME = 'nx.json';

/** package.json files in this repo are two-space indented and newline-terminated. */
const MANIFEST_INDENT = 2;

/**
 * The only shape of `nx.json` `release.projects` entry this driver understands,
 * e.g. "packages/*". Anything else is rejected rather than guessed at, so a
 * config change surfaces here instead of silently narrowing the release set.
 */
const DIRECTORY_GLOB_SUFFIX = '/*';

export interface ReleaseConfig {
  readonly registryUrl: string;
  readonly releaseTagPattern: string;
  readonly projectGlobs: readonly string[];
}

export interface ReleasePackage {
  readonly packageName: string;
  readonly manifestPath: string;
  readonly manifest: PackageManifest;
}

/** Every package nx may release, keyed by its npm package name. */
export type ReleasePackages = ReadonlyMap<string, ReleasePackage>;

interface NxReleaseConfigFile {
  release?: {
    projects?: string[];
    releaseTagPattern?: string;
    publish?: { registry?: string };
  };
}

const readJsonFile = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T;

export const writeManifest = (
  manifestPath: string,
  manifest: PackageManifest
): void => {
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, MANIFEST_INDENT)}\n`
  );
};

/**
 * Reads the release settings the driver has to agree with nx about. Every value
 * is required: a missing one means nx and this driver would disagree on where
 * packages live, which registry to check, or how tags are named.
 */
export const readReleaseConfig = (workspaceRoot: string): ReleaseConfig => {
  const nxConfigPath = join(workspaceRoot, NX_CONFIG_FILE_NAME);
  const { release } = readJsonFile<NxReleaseConfigFile>(nxConfigPath);

  const projectGlobs = release?.projects;
  if (!projectGlobs?.length) {
    throw new Error(
      `${nxConfigPath} has no "release.projects", so the set of releasable packages cannot be determined.`
    );
  }

  const releaseTagPattern = release?.releaseTagPattern;
  if (!releaseTagPattern) {
    throw new Error(
      `${nxConfigPath} has no "release.releaseTagPattern", so released versions cannot be read back from git tags.`
    );
  }

  const registryUrl = release?.publish?.registry;
  if (!registryUrl) {
    throw new Error(
      `${nxConfigPath} has no "release.publish.registry", so published versions cannot be verified before publishing.`
    );
  }

  return { registryUrl, releaseTagPattern, projectGlobs };
};

export const readReleasePackages = (
  workspaceRoot: string,
  projectGlobs: readonly string[]
): ReleasePackages => {
  const packages = new Map<string, ReleasePackage>();

  for (const glob of projectGlobs) {
    if (!glob.endsWith(DIRECTORY_GLOB_SUFFIX)) {
      throw new Error(
        `The release driver only understands "<directory>${DIRECTORY_GLOB_SUFFIX}" entries in nx.json "release.projects", but found "${glob}". Teach readReleasePackages the new shape before changing that config.`
      );
    }

    const parentDirectory = join(
      workspaceRoot,
      glob.slice(0, -DIRECTORY_GLOB_SUFFIX.length)
    );

    for (const entry of readdirSync(parentDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const manifestPath = join(parentDirectory, entry.name, MANIFEST_FILE_NAME);
      if (!existsSync(manifestPath)) {
        // Build output left behind by a deleted package: with no manifest, nx
        // does not see a project here either. Anything else - an unreadable or
        // malformed manifest - is a real problem and must not be skipped.
        continue;
      }
      const manifest = readJsonFile<PackageManifest>(manifestPath);

      if (!manifest.name) {
        throw new Error(`${manifestPath} has no "name", so it cannot be released.`);
      }
      packages.set(manifest.name, { packageName: manifest.name, manifestPath, manifest });
    }
  }

  return packages;
};

/**
 * nx project names and npm package names are configured to match in this repo.
 * Resolving through the manifest keeps that assumption explicit and loud.
 */
export const releasePackageForProject = (
  packages: ReleasePackages,
  projectName: string
): ReleasePackage => {
  const releasePackage = packages.get(projectName);
  if (!releasePackage) {
    throw new Error(
      `No package.json under the nx.json "release.projects" directories is named "${projectName}". The release driver resolves manifests by package name, so an nx project name that differs from its package name has to be mapped explicitly.`
    );
  }
  return releasePackage;
};
