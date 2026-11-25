import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = join(packageRoot, 'scripts', 'build-wasm.js');
const REMOTE_URL = 'git@github.com:babylonlabs-io/vault-wasm.git';
const CHILD_TIMEOUT_MS = 60_000;

test('build-wasm refuses a release tag that resolves to another commit', () => {
  // Read the tag from the script so a version bump does not break this test.
  const tag = readFileSync(buildScript, 'utf8').match(
    /^const VAULT_WASM_TAG = '([^']+)';$/m,
  )?.[1];
  assert.ok(tag, 'VAULT_WASM_TAG not found in build-wasm.js');

  const scratch = mkdtempSync(join(tmpdir(), 'build-wasm-pin-'));
  try {
    // Run a copy from a scratch package so the clone directory the script
    // derives from its own location, and deletes, is not the real one.
    const pkg = join(scratch, 'pkg');
    mkdirSync(join(pkg, 'scripts'), { recursive: true });
    copyFileSync(buildScript, join(pkg, 'scripts', 'build-wasm.js'));
    writeFileSync(join(pkg, 'package.json'), '{"type": "module"}\n');
    symlinkSync(join(packageRoot, 'node_modules'), join(pkg, 'node_modules'));

    const remote = join(scratch, 'remote');
    const binDir = join(scratch, 'bin');
    const llvmDir = join(scratch, 'llvm');
    const emptyConfig = join(scratch, 'empty.gitconfig');
    const redirectConfig = join(scratch, 'redirect.gitconfig');
    mkdirSync(remote);
    mkdirSync(binDir);
    mkdirSync(llvmDir);
    writeFileSync(emptyConfig, '');
    // The script only checks these are on PATH before cloning.
    for (const tool of ['rustup', 'wasm-pack']) {
      writeFileSync(join(binDir, tool), '#!/bin/sh\nexit 0\n');
      chmodSync(join(binDir, tool), 0o755);
    }

    // Isolated from the developer's config, which may sign with a hardware key.
    const isolatedEnv = {
      ...process.env,
      GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_CONFIG_NOSYSTEM: '1',
    };
    const git = (...args) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=test',
          '-c',
          'user.email=test@example.invalid',
          '-c',
          'commit.gpgsign=false',
          '-c',
          'tag.gpgsign=false',
          ...args,
        ],
        { cwd: remote, env: isolatedEnv, encoding: 'utf8' },
      ).trim();
    git('init', '--quiet');
    git('commit', '--quiet', '--allow-empty', '-m', 'stand-in release');
    git('tag', tag);
    const standInCommit = git('rev-parse', `${tag}^{commit}`);

    writeFileSync(
      redirectConfig,
      `[url "${remote}"]\n\tinsteadOf = ${REMOTE_URL}\n`,
    );

    const result = spawnSync(
      process.execPath,
      [join(pkg, 'scripts', 'build-wasm.js')],
      {
        cwd: pkg,
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          LLVM_BIN_PATH: llvmDir,
          GIT_CONFIG_GLOBAL: redirectConfig,
          GIT_CONFIG_NOSYSTEM: '1',
          // Fail fast instead of reaching GitHub if the redirect did not apply.
          GIT_SSH_COMMAND: 'false',
          GIT_TERMINAL_PROMPT: '0',
        },
      },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(
      result.stderr.includes(
        `Error: tag ${tag} resolves to ${standInCommit}, expected the pinned commit `,
      ),
      result.stderr,
    );
    assert.equal(
      existsSync(join(pkg, 'vault-wasm-temp')),
      false,
      'clone directory left behind',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
