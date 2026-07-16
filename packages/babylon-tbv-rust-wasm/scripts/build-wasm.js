// scripts/build-wasm.js
//
// Builds the WASM module from the vault-wasm facade repository — a single
// binary bundling every supported btc-vault tx-graph version (v1, v2) behind
// version-taking constructors that fail closed on unsupported versions.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import shell from 'shelljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - Update these when vault-wasm updates. Any rev bump swaps
// the binary that produces the frozen on-chain-binding secrets — re-run the
// golden-vector gate (src/__tests__ frozen vectors) before shipping.
const VAULT_WASM_REPO_URL = 'git@github.com:babylonlabs-io/vault-wasm.git';
const VAULT_WASM_BRANCH = 'main';
// main incl. PR #2 (P2A anchor exports); bundles btc-vault v1 @ a0ad5503, v2 @ d7e33b26.
const VAULT_WASM_COMMIT = '4d7ee90e803bfdcab9cf4f19e32bb0f37755bf27';
const REQUIRED_RUSTC_VERSION = '1.94';

const REPO_DIR = path.join(__dirname, '..', 'vault-wasm-temp');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'generated');

const buildWasm = async () => {
  try {
    console.log('Building vault-wasm (multi-version tx graph facade)...\n');

    // Ensure rustup toolchain is used
    const HOME = process.env.HOME;
    const RUSTUP_HOME = process.env.RUSTUP_HOME || `${HOME}/.rustup`;

    // We must build through rustup's proxy shims (not a standalone cargo/rustc)
    // so vault-wasm's rust-toolchain.toml selects the toolchain. `rustup-init`
    // normally installs those shims into ~/.cargo/bin, but some setups don't
    // have them there (e.g. Homebrew's `rustup` formula installs only the
    // rustup binary, and a separate Homebrew `rust` provides a cargo/rustc that
    // ignores rust-toolchain.toml). Locate the rustup binary and synthesize a
    // proxy dir of symlinks to it — rustup dispatches on argv[0], so a symlink
    // named `cargo`/`rustc` behaves as that proxy. Putting this dir first on
    // PATH guarantees rust-toolchain.toml is honored regardless of how rust was
    // installed.
    const rustupBin = shell.which('rustup');
    if (!rustupBin) {
      console.error(
        'Error: rustup not found on PATH. Install it from https://rustup.rs',
      );
      process.exit(1);
    }
    const cargoBinPath = path.join(os.tmpdir(), 'vault-wasm-rustup-proxies');
    shell.rm('-rf', cargoBinPath);
    shell.mkdir('-p', cargoBinPath);
    for (const proxy of [
      'cargo',
      'rustc',
      'rustup',
      'rustdoc',
      'cargo-clippy',
      'clippy-driver',
    ]) {
      fs.symlinkSync(rustupBin.toString(), path.join(cargoBinPath, proxy));
    }

    // Setup LLVM for wasm32 target (required for secp256k1-sys compilation)
    let LLVM_BIN_PATH = process.env.LLVM_BIN_PATH;
    if (!LLVM_BIN_PATH) {
      const homebrewLlvmPath = '/opt/homebrew/opt/llvm/bin';
      if (shell.test('-d', homebrewLlvmPath)) {
        LLVM_BIN_PATH = homebrewLlvmPath;
        console.log(`Using Homebrew LLVM: ${LLVM_BIN_PATH}`);
      } else {
        const clangPath = shell.which('clang');
        if (clangPath) {
          LLVM_BIN_PATH = path.dirname(clangPath.toString());
          console.warn(
            'Warning: Homebrew LLVM not found. Using system clang:',
            LLVM_BIN_PATH,
          );
        } else {
          console.error(
            'Error: No clang found. Please install LLVM via Homebrew: brew install llvm',
          );
          process.exit(1);
        }
      }
    }

    // Prepend cargo shims and LLVM to PATH so rust-toolchain.toml is respected
    shell.env.PATH = `${cargoBinPath}:${LLVM_BIN_PATH}:${shell.env.PATH}`;
    shell.env.RUSTUP_HOME = RUSTUP_HOME;

    // Set target-specific compiler variables for wasm32-unknown-unknown
    shell.env.CC_wasm32_unknown_unknown = `${LLVM_BIN_PATH}/clang`;
    shell.env.AR_wasm32_unknown_unknown = `${LLVM_BIN_PATH}/llvm-ar`;

    // Check prerequisites
    console.log('Checking prerequisites...');
    if (!shell.which('wasm-pack')) {
      console.error(
        'Error: wasm-pack not found. Install with: cargo install wasm-pack',
      );
      process.exit(1);
    }

    // Report the resolved rustc and its version. Use execFileSync (not
    // shelljs `exec`): a rustup proxy re-spawns the real rustc, and shelljs's
    // synchronous exec deadlocks on that double-spawn. This probe is purely
    // informational — the vault-wasm rust-toolchain.toml governs the actual
    // build — so a failure here only warns.
    const proxyEnv = {
      ...process.env,
      PATH: shell.env.PATH,
      RUSTUP_HOME: shell.env.RUSTUP_HOME,
    };
    console.log(`Using rustc from: ${cargoBinPath}/rustc`);
    let rustcVersion = '';
    try {
      rustcVersion = execFileSync('rustc', ['--version'], { env: proxyEnv })
        .toString()
        .trim();
      console.log(`Rustc version: ${rustcVersion}`);
    } catch {
      console.warn(
        'Warning: could not determine the default rustc version. ' +
          'Continuing — the vault-wasm rust-toolchain.toml selects the build toolchain.',
      );
    }

    if (!rustcVersion.includes(REQUIRED_RUSTC_VERSION)) {
      console.warn(
        `\nWarning: Default rustc is ${rustcVersion}, expected ${REQUIRED_RUSTC_VERSION}.`,
        `\nThe vault-wasm rust-toolchain.toml will override the toolchain during build.\n`,
      );
    }

    // Clean up any previous temp directory
    if (shell.test('-d', REPO_DIR)) {
      console.log('Cleaning up previous temp directory...');
      shell.rm('-rf', REPO_DIR);
    }

    // Clone the repository
    // Use execFileSync with argument array to avoid shell command injection
    console.log(
      `Cloning vault-wasm repository (branch: ${VAULT_WASM_BRANCH})...`,
    );
    try {
      execFileSync(
        'git',
        ['clone', '--branch', VAULT_WASM_BRANCH, VAULT_WASM_REPO_URL, REPO_DIR],
        { stdio: 'inherit' },
      );
    } catch {
      console.error('Error: Failed to clone repository');
      process.exit(1);
    }

    // Checkout specific commit
    console.log(`Checking out commit: ${VAULT_WASM_COMMIT}...`);
    try {
      execFileSync('git', ['checkout', VAULT_WASM_COMMIT], {
        cwd: REPO_DIR,
        stdio: 'inherit',
      });
    } catch {
      console.error('Error: Failed to checkout commit');
      shell.rm('-rf', REPO_DIR);
      process.exit(1);
    }

    // Ensure wasm32 target is installed for the toolchain specified in rust-toolchain.toml
    console.log('Adding wasm32-unknown-unknown target...');
    try {
      execFileSync('rustup', ['target', 'add', 'wasm32-unknown-unknown'], {
        cwd: REPO_DIR,
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: shell.env.PATH,
          RUSTUP_HOME: shell.env.RUSTUP_HOME,
        },
      });
    } catch {
      console.error('Error: Failed to add wasm32-unknown-unknown target');
      shell.rm('-rf', REPO_DIR);
      process.exit(1);
    }

    // Build with wasm-pack at the crate root. vault-wasm has no cargo
    // features to select — the per-version btc-vault deps enable `wasm-api`
    // themselves — so no `--features` tail (the old btc-vault `wasm` feature
    // does not exist here and would fail the build).
    console.log('Building WASM with wasm-pack from the vault-wasm crate root...');
    const wasmOutputDir = path.join(REPO_DIR, 'wasm-build-output');

    try {
      execFileSync(
        'wasm-pack',
        [
          'build',
          '--target',
          'web',
          '--scope',
          'babylonlabs-io',
          '--out-dir',
          wasmOutputDir,
        ],
        {
          cwd: REPO_DIR,
          stdio: 'inherit',
          env: {
            ...process.env,
            PATH: shell.env.PATH,
            RUSTUP_HOME: shell.env.RUSTUP_HOME,
            CC_wasm32_unknown_unknown: shell.env.CC_wasm32_unknown_unknown,
            AR_wasm32_unknown_unknown: shell.env.AR_wasm32_unknown_unknown,
          },
        },
      );
    } catch {
      console.error('Error: wasm-pack build failed');
      shell.rm('-rf', REPO_DIR);
      process.exit(1);
    }

    // Copy generated files to dist/generated. The node entrypoint
    // (src/index-node.ts) loads this same web artifact via readFileSync +
    // initSync, so no separate nodejs-target build is needed.
    console.log('Copying generated files...');
    const name = 'vault_wasm';

    shell.rm('-rf', OUTPUT_DIR);
    shell.mkdir('-p', OUTPUT_DIR);
    shell.cp(`${wasmOutputDir}/${name}.js`, `${OUTPUT_DIR}/${name}.js`);
    shell.cp(`${wasmOutputDir}/${name}.d.ts`, `${OUTPUT_DIR}/${name}.d.ts`);
    shell.cp(`${wasmOutputDir}/${name}_bg.wasm`, `${OUTPUT_DIR}/${name}_bg.wasm`);
    shell.cp(`${wasmOutputDir}/${name}_bg.wasm.d.ts`, `${OUTPUT_DIR}/${name}_bg.wasm.d.ts`);

    // Clean up
    console.log('Cleaning up...');
    shell.rm('-rf', REPO_DIR);

    console.log('\n✅ WASM build completed successfully!');
    console.log(`Generated files: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('Error during WASM build:', error);
    // Clean up on error
    if (shell.test('-d', REPO_DIR)) {
      shell.rm('-rf', REPO_DIR);
    }
    process.exit(1);
  }
};

buildWasm();
