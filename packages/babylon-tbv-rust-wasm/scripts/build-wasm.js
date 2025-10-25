// scripts/build-wasm.js
import shell from 'shelljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - IMPORTANT: Update these when btc-vault updates
const BTC_VAULT_REPO_URL = 'git@github.com:babylonlabs-io/btc-vault.git';
const BTC_VAULT_BRANCH = 'main';
const BTC_VAULT_COMMIT = '0e47900';
// TODO: When btc-vault starts using release tags, switch to tag-based versioning:
// const BTC_VAULT_TAG = "v1.0.0";

const REPO_DIR = 'btc-vault-temp';
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'generated');

const buildWasm = async () => {
  try {
    console.log('Building BTC Vault WASM...\n');

    // Ensure rustup toolchain is used (not homebrew rust)
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
      // Try Homebrew LLVM first (required for wasm32 target)
      const homebrewLlvmPath = '/opt/homebrew/opt/llvm/bin';
      if (shell.test('-d', homebrewLlvmPath)) {
        LLVM_BIN_PATH = homebrewLlvmPath;
        console.log(`Using Homebrew LLVM: ${LLVM_BIN_PATH}`);
      } else {
        // Fallback to system clang (may not support wasm32)
        const clangPath = shell.which('clang');
        if (clangPath) {
          LLVM_BIN_PATH = path.dirname(clangPath.toString());
          console.warn(
            'Warning: Homebrew LLVM not found. Using system clang:',
            LLVM_BIN_PATH,
            '(may not support wasm32-unknown-unknown target)',
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

    // Clone the repository
    console.log(
      `Cloning btc-vault repository (branch: ${BTC_VAULT_BRANCH})...`,
    );
    const cloneResult = shell.exec(
      `git clone --depth 1 --branch ${BTC_VAULT_BRANCH} ${BTC_VAULT_REPO_URL} ${REPO_DIR}`,
    );

    if (cloneResult.code !== 0) {
      console.error('Error: Failed to clone repository');
      process.exit(1);
    }

    // Checkout specific commit
    console.log(`Checking out commit: ${BTC_VAULT_COMMIT}...`);
    shell.cd(REPO_DIR);
    shell.exec(`git fetch origin ${BTC_VAULT_COMMIT}`);
    const checkoutResult = shell.exec(`git checkout ${BTC_VAULT_COMMIT}`);

    if (checkoutResult.code !== 0) {
      console.error('Error: Failed to checkout commit');
      process.exit(1);
    }

    // Remove Cargo.lock to allow dependency resolution
    console.log('Removing Cargo.lock to regenerate dependencies...');
    shell.rm('-f', 'Cargo.lock');

    // Build with wasm-pack
    console.log('Building WASM with wasm-pack...');
    const buildResult = shell.exec(
      'wasm-pack build --target web --scope babylonlabs-io --out-dir ../wasm-build-output crates/vault -- --features wasm',
    );

    if (buildResult.code !== 0) {
      console.error('Error: wasm-pack build failed');
      shell.cd('..');
      process.exit(1);
    }

    shell.cd('..');

    // Copy generated files to src/generated
    console.log('Copying generated files...');
    shell.rm('-rf', OUTPUT_DIR);
    shell.mkdir('-p', OUTPUT_DIR);

    // The output files are named based on the package name (btc-vault -> btc_vault)
    const pkgName = 'btc_vault';
    const wasmOutputDir = `${REPO_DIR}/crates/wasm-build-output`;

    shell.cp(`${wasmOutputDir}/${pkgName}.js`, OUTPUT_DIR);
    shell.cp(`${wasmOutputDir}/${pkgName}.d.ts`, OUTPUT_DIR);
    shell.cp(`${wasmOutputDir}/${pkgName}_bg.wasm`, OUTPUT_DIR);
    shell.cp(`${wasmOutputDir}/${pkgName}_bg.wasm.d.ts`, OUTPUT_DIR);

    // Clean up
    console.log('Cleaning up...');
    shell.rm('-rf', REPO_DIR);

    console.log('\n✅ WASM build completed successfully!');
    console.log(`Generated files are in: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('Error during WASM build:', error);
    process.exit(1);
  }
};

buildWasm();
