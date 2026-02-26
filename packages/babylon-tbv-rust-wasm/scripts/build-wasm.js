// scripts/build-wasm.js
//
// Builds WASM module from btc-vault repository.
// Exports: WasmPeginTx, WasmPeginPayoutConnector, WasmPayoutTx, WasmPayoutOptimisticTx

import { execFileSync } from 'node:child_process';
import shell from 'shelljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - Update these when btc-vault updates
const BTC_VAULT_REPO_URL = 'git@github.com:babylonlabs-io/btc-vault.git';
const BTC_VAULT_BRANCH = 'main';
const BTC_VAULT_COMMIT = 'e7427c1eaf94747f480486b739ab83094de7ffb3';
const REQUIRED_RUSTC_VERSION = '1.92.0';

const REPO_DIR = path.join(__dirname, '..', 'btc-vault-temp');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'generated');

const buildWasm = async () => {
  try {
    console.log('Building BTC Vault WASM...\n');

    // Ensure rustup toolchain is used
    const HOME = process.env.HOME;
    const RUSTUP_HOME = process.env.RUSTUP_HOME || `${HOME}/.rustup`;

    // Get the rustup rustc path
    const rustcPathResult = shell.exec('rustup which rustc', { silent: true });
    if (rustcPathResult.code !== 0) {
      console.error('Error: rustup not found or not configured properly');
      process.exit(1);
    }

    const rustcPath = rustcPathResult.stdout.trim();
    const rustupBinPath = path.dirname(rustcPath);

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

    // Prepend rustup toolchain bin and LLVM to PATH
    shell.env.PATH = `${rustupBinPath}:${LLVM_BIN_PATH}:${shell.env.PATH}`;
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

    // Verify rustup is being used
    const verifyRustc = shell
      .exec('which rustc', { silent: true })
      .stdout.trim();
    console.log(`Using rustc from: ${verifyRustc}`);

    // Verify rustc version matches required version
    const rustcVersionResult = shell.exec('rustc --version', { silent: true });
    if (rustcVersionResult.code !== 0) {
      console.error('Error: Failed to get rustc version');
      process.exit(1);
    }
    const rustcVersion = rustcVersionResult.stdout.trim();
    console.log(`Rustc version: ${rustcVersion}`);

    if (!rustcVersion.includes(REQUIRED_RUSTC_VERSION)) {
      console.error(
        `\nError: Incorrect rustc version detected.`,
        `\nRequired: ${REQUIRED_RUSTC_VERSION}`,
        `\nFound: ${rustcVersion}`,
        `\n\nPlease update your Rust toolchain:`,
        `\n  rustup update stable`,
        `\nThen verify the version:`,
        `\n  rustc --version\n`
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

    // Checkout specific commit (or stay on branch HEAD if not specified)
    if (BTC_VAULT_COMMIT) {
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
    } else {
      console.log(`Using latest ${BTC_VAULT_BRANCH} branch HEAD...`);
    }

    // Build with wasm-pack from vault-new crate
    console.log('Building WASM with wasm-pack from crates/vault-new...');
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
          'crates/vault-new',
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

    // Copy generated files to dist/generated
    console.log('Copying generated files...');
    shell.rm('-rf', OUTPUT_DIR);
    shell.mkdir('-p', OUTPUT_DIR);

    // The output files are named btc_vault_new (from package name)
    // Rename to btc_vault for consistency
    const srcName = 'btc_vault_new';
    const targetName = 'btc_vault';

    shell.cp(`${wasmOutputDir}/${srcName}.js`, `${OUTPUT_DIR}/${targetName}.js`);
    shell.cp(`${wasmOutputDir}/${srcName}.d.ts`, `${OUTPUT_DIR}/${targetName}.d.ts`);
    shell.cp(`${wasmOutputDir}/${srcName}_bg.wasm`, `${OUTPUT_DIR}/${targetName}_bg.wasm`);
    shell.cp(`${wasmOutputDir}/${srcName}_bg.wasm.d.ts`, `${OUTPUT_DIR}/${targetName}_bg.wasm.d.ts`);

    // Update imports in JS file to match renamed wasm file
    const jsFilePath = `${OUTPUT_DIR}/${targetName}.js`;
    const jsContent = shell.cat(jsFilePath).toString();
    const updatedJsContent = jsContent.replace(
      new RegExp(`${srcName}_bg\\.wasm`, 'g'),
      `${targetName}_bg.wasm`,
    );
    shell.ShellString(updatedJsContent).to(jsFilePath);

    // Update imports in d.ts file
    const dtsFilePath = `${OUTPUT_DIR}/${targetName}.d.ts`;
    const dtsContent = shell.cat(dtsFilePath).toString();
    const updatedDtsContent = dtsContent.replace(
      new RegExp(`${srcName}_bg\\.wasm`, 'g'),
      `${targetName}_bg.wasm`,
    );
    shell.ShellString(updatedDtsContent).to(dtsFilePath);

    // Clean up
    console.log('Cleaning up...');
    shell.rm('-rf', REPO_DIR);

    console.log('\n✅ WASM build completed successfully!');
    console.log(`Generated files are in: ${OUTPUT_DIR}`);
    console.log('\nExported modules:');
    console.log('  - WasmPeginTx (PegIn transaction creation)');
    console.log('  - WasmPeginPayoutConnector (Payout script generation)');
    console.log('  - WasmPayoutTx (Payout transaction)');
    console.log('  - WasmPayoutOptimisticTx (Optimistic payout transaction)');
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
