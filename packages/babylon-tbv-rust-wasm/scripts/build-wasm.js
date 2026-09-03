// scripts/build-wasm.js
//
// Builds the WASM module from the vault-wasm facade repository — a single
// binary bundling every supported btc-vault tx-graph version (v1, v2, v3)
// behind version-taking constructors that fail closed on unsupported versions.

import { execFileSync } from 'node:child_process';
import shell from 'shelljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - Update these when vault-wasm updates. Any rev bump swaps
// the binary that produces the frozen on-chain-binding secrets — re-run the
// golden-vector gate (src/__tests__ frozen vectors) before shipping.
const VAULT_WASM_REPO_URL = 'git@github.com:babylonlabs-io/vault-wasm.git';
const VAULT_WASM_BRANCH = 'gai/delegated-claim-assembly-exports';
// vault-wasm PR #6 (delegated-claim assembly exports, graph v3 only) on top
// of PR #4 (tx graph v3 / Vault Core 3); bundles btc-vault
// v1 @ 2c1177ec (tag v0.6.1), v2 @ 27c0062b (tag v0.8.0), v3 @ 729fc3da.
//
// TEMPORARY PIN. Both upstream PRs are open: vault-wasm#6 is a draft and its
// v3 rev is btc-vault#2655's head, which becomes unreachable once that PR
// squash-merges. Re-pin to vault-wasm main (or the v0.9.0 tag) before this
// package is published.
const VAULT_WASM_COMMIT = '1c16496bd7d3a8e1eeb664816eef0a2930a6d6b4';
const REQUIRED_RUSTC_VERSION = '1.94';

const REPO_DIR = path.join(__dirname, '..', 'vault-wasm-temp');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'generated');

const buildWasm = async () => {
  try {
    console.log('Building vault-wasm (multi-version tx graph facade)...\n');

    // Ensure rustup toolchain is used
    const HOME = process.env.HOME;
    const RUSTUP_HOME = process.env.RUSTUP_HOME || `${HOME}/.rustup`;

    // The build must run on the toolchain vault-wasm's rust-toolchain.toml
    // names, not on whatever cargo/rustc happens to be first on PATH (a
    // Homebrew `rust` provides both and ignores rust-toolchain.toml). rustup
    // is the only thing that can resolve that file, so it is required here;
    // the toolchain's own bin directory is resolved further down, after
    // checkout, once that file exists on disk.
    if (!shell.which('rustup')) {
      console.error(
        'Error: rustup not found on PATH. Install it from https://rustup.rs',
      );
      process.exit(1);
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

    // Prepend LLVM so the wasm32 C toolchain resolves. The pinned Rust
    // toolchain goes on PATH later, after its directory is resolved.
    shell.env.PATH = `${LLVM_BIN_PATH}:${shell.env.PATH}`;
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

    // Put the pinned toolchain's own bin directory first on PATH. `rustup
    // which`, run inside the checkout, resolves rust-toolchain.toml to the
    // absolute cargo/rustc for that channel; its directory is what wasm-pack
    // must see. Resolving the real binaries — rather than synthesizing
    // argv[0] proxy symlinks to the rustup binary — is what makes this work
    // on every install shape: Homebrew's rustup ships only the `rustup`
    // binary and does no argv[0] dispatch, so such a symlink named `cargo`
    // runs rustup's own CLI and every cargo invocation fails with an empty
    // error message.
    console.log('Resolving the toolchain from rust-toolchain.toml...');
    let toolchainBinDir = '';
    try {
      toolchainBinDir = path.dirname(
        execFileSync('rustup', ['which', 'cargo'], {
          cwd: REPO_DIR,
          env: { ...process.env, PATH: shell.env.PATH, RUSTUP_HOME },
        })
          .toString()
          .trim(),
      );
    } catch {
      console.error(
        'Error: `rustup which cargo` failed inside the checkout, so the ' +
          'toolchain named by vault-wasm rust-toolchain.toml could not be ' +
          'resolved. Building against a different toolchain is not safe here ' +
          '— the artifact is a frozen, on-chain-binding dependency.',
      );
      shell.rm('-rf', REPO_DIR);
      process.exit(1);
    }
    shell.env.PATH = `${toolchainBinDir}:${shell.env.PATH}`;

    // Fail loudly if that cargo does not actually run. wasm-pack shells out to
    // `cargo metadata` and reports its failure with an empty message, so an
    // unusable cargo surfaces downstream as a blank error.
    const toolchainEnv = {
      ...process.env,
      PATH: shell.env.PATH,
      RUSTUP_HOME,
    };
    let rustcVersion = '';
    try {
      rustcVersion = execFileSync('rustc', ['--version'], { env: toolchainEnv })
        .toString()
        .trim();
      execFileSync('cargo', ['--version'], { env: toolchainEnv });
    } catch {
      console.error(
        `Error: the toolchain at ${toolchainBinDir} does not provide a ` +
          'working rustc/cargo pair.',
      );
      shell.rm('-rf', REPO_DIR);
      process.exit(1);
    }
    console.log(`Using ${rustcVersion} from: ${toolchainBinDir}`);

    if (!rustcVersion.includes(REQUIRED_RUSTC_VERSION)) {
      console.warn(
        `\nWarning: resolved rustc is ${rustcVersion}, expected ` +
          `${REQUIRED_RUSTC_VERSION}. vault-wasm's rust-toolchain.toml is ` +
          `authoritative — update REQUIRED_RUSTC_VERSION if it moved.\n`,
      );
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
