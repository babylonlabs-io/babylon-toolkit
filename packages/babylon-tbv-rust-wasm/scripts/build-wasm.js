// scripts/build-wasm.js
//
// Builds a minimal WASM module containing ONLY:
// - WasmPeginTx (for creating unfunded peg-in transactions)
// - WasmPeginPayoutConnector (for generating payout scripts)

import { execFileSync } from 'node:child_process';
import shell from 'shelljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RUST_SRC_DIR = path.join(__dirname, '..', 'rust-src');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'generated');

const buildWasm = async () => {
  try {
    console.log('Building Babylon Vault WASM (minimal - PegIn & PayoutConnector only)...\n');

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

    // Setup LLVM for wasm32 target
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

    // Verify rust-src exists
    if (!shell.test('-d', RUST_SRC_DIR)) {
      console.error(`Error: Rust source directory not found: ${RUST_SRC_DIR}`);
      process.exit(1);
    }

    // Build with wasm-pack from local source
    // Use execFileSync to avoid shell command injection (CodeQL security fix)
    console.log(`Building WASM from: ${RUST_SRC_DIR}`);
    try {
      execFileSync('wasm-pack', [
        'build',
        '--target', 'web',
        '--scope', 'babylonlabs-io',
        '--out-dir', OUTPUT_DIR,
        RUST_SRC_DIR,
      ], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: shell.env.PATH,
          RUSTUP_HOME: shell.env.RUSTUP_HOME,
          CC_wasm32_unknown_unknown: shell.env.CC_wasm32_unknown_unknown,
          AR_wasm32_unknown_unknown: shell.env.AR_wasm32_unknown_unknown,
        },
      });
    } catch {
      console.error('Error: wasm-pack build failed');
      process.exit(1);
    }

    // Rename output files to match expected names
    console.log('Renaming output files...');
    const pkgName = 'babylon_vault_wasm';
    const targetName = 'btc_vault';

    // Rename files if needed (wasm-pack uses package name)
    if (shell.test('-f', `${OUTPUT_DIR}/${pkgName}.js`)) {
      shell.mv(`${OUTPUT_DIR}/${pkgName}.js`, `${OUTPUT_DIR}/${targetName}.js`);
      shell.mv(`${OUTPUT_DIR}/${pkgName}.d.ts`, `${OUTPUT_DIR}/${targetName}.d.ts`);
      shell.mv(`${OUTPUT_DIR}/${pkgName}_bg.wasm`, `${OUTPUT_DIR}/${targetName}_bg.wasm`);
      shell.mv(`${OUTPUT_DIR}/${pkgName}_bg.wasm.d.ts`, `${OUTPUT_DIR}/${targetName}_bg.wasm.d.ts`);
    }

    // Clean up package.json and .gitignore created by wasm-pack
    shell.rm('-f', `${OUTPUT_DIR}/package.json`);
    shell.rm('-f', `${OUTPUT_DIR}/.gitignore`);

    console.log('\n✅ WASM build completed successfully!');
    console.log(`Generated files are in: ${OUTPUT_DIR}`);
    console.log('\nExported modules:');
    console.log('  - WasmPeginTx (PegIn transaction creation)');
    console.log('  - WasmPeginPayoutConnector (Payout script generation)');
    console.log('\nConfidential code NOT included:');
    console.log('  - Transaction graph (tx_graphs)');
    console.log('  - Claim, Assert, Challenge transactions');
  } catch (error) {
    console.error('Error during WASM build:', error);
    process.exit(1);
  }
};

buildWasm();
