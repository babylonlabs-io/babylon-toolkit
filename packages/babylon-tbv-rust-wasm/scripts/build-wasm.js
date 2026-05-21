// scripts/build-wasm.js
//
// Builds WASM module from btc-vault repository.
// Exports: WasmPeginTx, WasmPeginPayoutConnector, WasmPayoutTx, WasmPayoutOptimisticTx

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import shell from 'shelljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - Update these when btc-vault updates
const BTC_VAULT_REPO_URL = 'git@github.com:babylonlabs-io/btc-vault.git';
const BTC_VAULT_BRANCH = 'main';
const BTC_VAULT_COMMIT = '785df36f';
const REQUIRED_RUSTC_VERSION = '1.90';

const REPO_DIR = path.join(__dirname, '..', 'btc-vault-temp');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'generated');
const OUTPUT_DIR_NODE = path.join(__dirname, '..', 'dist', 'generated-node');

const buildWasm = async () => {
  try {
    console.log('Building BTC Vault WASM...\n');

    // Ensure rustup toolchain is used
    const HOME = process.env.HOME;
    const RUSTUP_HOME = process.env.RUSTUP_HOME || `${HOME}/.rustup`;

    // We must build through rustup's proxy shims (not a standalone cargo/rustc)
    // so btc-vault's rust-toolchain.toml selects the toolchain. `rustup-init`
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
    const cargoBinPath = path.join(os.tmpdir(), 'btc-vault-rustup-proxies');
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
    // informational — the btc-vault rust-toolchain.toml governs the actual
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
          'Continuing — the btc-vault rust-toolchain.toml selects the build toolchain.',
      );
    }

    if (!rustcVersion.includes(REQUIRED_RUSTC_VERSION)) {
      console.warn(
        `\nWarning: Default rustc is ${rustcVersion}, expected ${REQUIRED_RUSTC_VERSION}.`,
        `\nThe btc-vault rust-toolchain.toml will override the toolchain during build.\n`,
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
      `Cloning btc-vault repository (branch: ${BTC_VAULT_BRANCH})...`,
    );
    try {
      execFileSync(
        'git',
        ['clone', '--branch', BTC_VAULT_BRANCH, BTC_VAULT_REPO_URL, REPO_DIR],
        { stdio: 'inherit' },
      );
    } catch {
      console.error('Error: Failed to clone repository');
      process.exit(1);
    }

    // Checkout specific commit
    console.log(`Checking out commit: ${BTC_VAULT_COMMIT}...`);
    try {
      execFileSync('git', ['checkout', BTC_VAULT_COMMIT], {
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

    // Build with wasm-pack from vault crate
    console.log('Building WASM with wasm-pack from crates/vault...');
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
          'crates/vault',
          '--',
          '--no-default-features',
          '--features',
          'wasm',
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

    // Build Node.js target
    console.log('Building WASM with wasm-pack for Node.js target...');
    const wasmOutputDirNode = path.join(REPO_DIR, 'wasm-build-output-node');

    try {
      execFileSync(
        'wasm-pack',
        [
          'build',
          '--target',
          'nodejs',
          '--scope',
          'babylonlabs-io',
          '--out-dir',
          wasmOutputDirNode,
          'crates/vault',
          '--',
          '--no-default-features',
          '--features',
          'wasm',
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
      console.error('Error: wasm-pack build (nodejs target) failed');
      shell.rm('-rf', REPO_DIR);
      process.exit(1);
    }

    // Copy generated files to dist/generated (web) and dist/generated-node (nodejs)
    console.log('Copying generated files...');
    const name = 'btc_vault';

    shell.rm('-rf', OUTPUT_DIR);
    shell.mkdir('-p', OUTPUT_DIR);
    shell.cp(`${wasmOutputDir}/${name}.js`, `${OUTPUT_DIR}/${name}.js`);
    shell.cp(`${wasmOutputDir}/${name}.d.ts`, `${OUTPUT_DIR}/${name}.d.ts`);
    shell.cp(`${wasmOutputDir}/${name}_bg.wasm`, `${OUTPUT_DIR}/${name}_bg.wasm`);
    shell.cp(`${wasmOutputDir}/${name}_bg.wasm.d.ts`, `${OUTPUT_DIR}/${name}_bg.wasm.d.ts`);

    shell.rm('-rf', OUTPUT_DIR_NODE);
    shell.mkdir('-p', OUTPUT_DIR_NODE);
    // Rename .js to .cjs since the package uses "type": "module"
    shell.cp(`${wasmOutputDirNode}/${name}.js`, `${OUTPUT_DIR_NODE}/${name}.cjs`);
    shell.cp(`${wasmOutputDirNode}/${name}.d.ts`, `${OUTPUT_DIR_NODE}/${name}.d.ts`);
    shell.cp(`${wasmOutputDirNode}/${name}_bg.wasm`, `${OUTPUT_DIR_NODE}/${name}_bg.wasm`);
    shell.cp(`${wasmOutputDirNode}/${name}_bg.wasm.d.ts`, `${OUTPUT_DIR_NODE}/${name}_bg.wasm.d.ts`);

    // Clean up
    console.log('Cleaning up...');
    shell.rm('-rf', REPO_DIR);

    console.log('\n✅ WASM build completed successfully!');
    console.log(`Generated files (web):    ${OUTPUT_DIR}`);
    console.log(`Generated files (nodejs): ${OUTPUT_DIR_NODE}`);
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
