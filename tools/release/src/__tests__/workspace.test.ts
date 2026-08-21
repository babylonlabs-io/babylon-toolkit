import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readReleaseConfig,
  readReleasePackages,
  releasePackageForProject,
  writeManifest,
} from '../workspace.js';

const roots: string[] = [];

const workspace = (files: Record<string, unknown>): string => {
  const root = mkdtempSync(join(tmpdir(), 'release-workspace-'));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(contents, null, 2)}\n`);
  }
  return root;
};

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

const NX_CONFIG = {
  release: {
    projects: ['packages/*'],
    releaseTagPattern: '{projectName}/{version}',
    publish: { registry: 'https://registry.npmjs.org' },
  },
};

describe('readReleaseConfig', () => {
  it('reads the settings the driver has to agree with nx about', () => {
    expect(readReleaseConfig(workspace({ 'nx.json': NX_CONFIG }))).toEqual({
      registryUrl: 'https://registry.npmjs.org',
      releaseTagPattern: '{projectName}/{version}',
      projectGlobs: ['packages/*'],
    });
  });

  it('refuses to guess the registry to verify pins against', () => {
    const root = workspace({
      'nx.json': { release: { ...NX_CONFIG.release, publish: {} } },
    });

    expect(() => readReleaseConfig(root)).toThrow('release.publish.registry');
  });

  it('refuses to guess how release tags are named', () => {
    const root = workspace({
      'nx.json': {
        release: { projects: ['packages/*'], publish: { registry: 'https://r' } },
      },
    });

    expect(() => readReleaseConfig(root)).toThrow('releaseTagPattern');
  });

  it('refuses to guess which packages are releasable', () => {
    const root = workspace({
      'nx.json': { release: { ...NX_CONFIG.release, projects: [] } },
    });

    expect(() => readReleaseConfig(root)).toThrow('release.projects');
  });
});

describe('readReleasePackages', () => {
  it('discovers every package under the glob, keyed by package name', () => {
    const root = workspace({
      'packages/babylon-ts-sdk/package.json': {
        name: '@babylonlabs-io/ts-sdk',
        version: '0.1.2',
      },
      'packages/babylon-core-ui/package.json': {
        name: '@babylonlabs-io/core-ui',
        version: '0.0.0-semantic-release',
      },
    });

    const packages = readReleasePackages(root, ['packages/*']);

    expect([...packages.keys()].sort()).toEqual([
      '@babylonlabs-io/core-ui',
      '@babylonlabs-io/ts-sdk',
    ]);
    expect(packages.get('@babylonlabs-io/ts-sdk')?.manifestPath).toBe(
      join(root, 'packages/babylon-ts-sdk/package.json')
    );
  });

  it('ignores a directory with no manifest, which is build output from a deleted package', () => {
    const root = workspace({
      'packages/babylon-ts-sdk/package.json': { name: '@babylonlabs-io/ts-sdk' },
    });
    mkdirSync(join(root, 'packages/babylon-sdk/dist'), { recursive: true });

    expect([...readReleasePackages(root, ['packages/*']).keys()]).toEqual([
      '@babylonlabs-io/ts-sdk',
    ]);
  });

  it('refuses a manifest with no name rather than skipping it', () => {
    // A package this silently failed to discover would have its workspace
    // protocol neither rewritten nor reported, and would ship verbatim.
    const root = workspace({
      'nx.json': NX_CONFIG,
      'packages/babylon-ts-sdk/package.json': { version: '0.1.2' },
    });

    expect(() => readReleasePackages(root, ['packages/*'])).toThrow('no "name"');
  });

  it('refuses a glob shape it was not taught to expand', () => {
    const root = workspace({ 'nx.json': NX_CONFIG });

    expect(() => readReleasePackages(root, ['packages/**/lib'])).toThrow(
      'release.projects'
    );
  });
});

describe('releasePackageForProject', () => {
  it('fails loudly when an nx project name does not match any package name', () => {
    const packages = readReleasePackages(
      workspace({
        'packages/babylon-ts-sdk/package.json': {
          name: '@babylonlabs-io/ts-sdk',
        },
      }),
      ['packages/*']
    );

    expect(() => releasePackageForProject(packages, '@scope/renamed')).toThrow(
      '@scope/renamed'
    );
  });
});

describe('writeManifest', () => {
  it('writes two-space JSON with a trailing newline, matching the repo', () => {
    const root = workspace({});
    const manifestPath = join(root, 'package.json');

    writeManifest(manifestPath, { name: '@scope/pkg', version: '1.0.0' });

    expect(readFileSync(manifestPath, 'utf8')).toBe(
      '{\n  "name": "@scope/pkg",\n  "version": "1.0.0"\n}\n'
    );
  });
});
