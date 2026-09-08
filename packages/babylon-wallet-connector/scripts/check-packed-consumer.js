import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = resolve(packageRoot, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "wallet-connector-packed-consumer-")));
const childEnv = { ...process.env };
delete childEnv.NODE_PATH;

const readManifest = (root) => JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const sourceManifest = readManifest(packageRoot);
const packageManager = readManifest(resolve(packagesRoot, "..")).packageManager;
const workspacePackages = new Map();
for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  const root = join(packagesRoot, entry.name);
  if (entry.isDirectory() && existsSync(join(root, "package.json"))) {
    const manifest = readManifest(root);
    workspacePackages.set(manifest.name, { root, manifest });
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, env: childEnv, stdio: "inherit" });
}

const tarballs = {};
function pack(name) {
  if (tarballs[name]) return;
  const { root, manifest } = workspacePackages.get(name);
  const tarball = join(tempRoot, `${name.replaceAll("/", "-")}.tgz`);
  execFileSync(pnpm, ["pack", "--out", tarball], { cwd: root, env: childEnv });
  tarballs[name] = `file:${tarball}`;
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    if (workspacePackages.has(dependency)) pack(dependency);
  }
}

function peersFor(manifest, includeOptional, peers = {}, visited = new Set()) {
  if (visited.has(manifest.name)) return peers;
  visited.add(manifest.name);
  const selected = {};
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (includeOptional || !manifest.peerDependenciesMeta?.[name]?.optional) {
      const root = workspacePackages.get(manifest.name).root;
      selected[name] = tarballs[name] ?? readManifest(join(root, "node_modules", name)).version;
    }
  }
  Object.assign(peers, selected);
  for (const name of Object.keys({ ...manifest.dependencies, ...selected })) {
    const workspace = workspacePackages.get(name);
    if (workspace) peersFor(workspace.manifest, includeOptional, peers, visited);
  }
  return peers;
}

let browser;
try {
  pack(sourceManifest.name);
  const workspaceOverrides = {};
  for (const name of Object.keys(tarballs)) {
    for (const dependency of Object.keys(workspacePackages.get(name).manifest.dependencies ?? {})) {
      if (tarballs[dependency]) workspaceOverrides[dependency] = tarballs[dependency];
    }
  }
  browser = await chromium.launch();

  for (const mode of ["eth", "btc"]) {
    const consumerRoot = join(tempRoot, mode);
    mkdirSync(consumerRoot);
    writeFileSync(
      join(consumerRoot, "package.json"),
      JSON.stringify({
        name: `wallet-connector-packed-${mode}-consumer`,
        private: true,
        type: "module",
        packageManager,
        dependencies: {
          [sourceManifest.name]: tarballs[sourceManifest.name],
          // Keplr 0.12.272 requires Starknet 7. Core UI requires Tailwind.
          starknet: "7.6.4",
          tailwindcss: "3.4.17",
          // WalletConnect's older ABI types require the Zod 3 consumer peer.
          zod: "3.22.4",
          // BitcoinJS and Keystone use Node built-ins. Supply their browser packages.
          ...(mode === "btc" ? { buffer: sourceManifest.devDependencies.buffer, events: "3.3.0" } : {}),
          ...peersFor(sourceManifest, mode === "btc"),
        },
        devDependencies: {
          "@types/react": sourceManifest.devDependencies["@types/react"],
          "@types/react-dom": sourceManifest.devDependencies["@types/react-dom"],
          typescript: readManifest(join(packageRoot, "node_modules/typescript")).version,
          vite: readManifest(join(packageRoot, "node_modules/vite")).version,
          "vite-plugin-node-polyfills": readManifest(join(packageRoot, "node_modules/vite-plugin-node-polyfills"))
            .version,
        },
        pnpm: {
          overrides: {
            ...workspaceOverrides,
            // Test the supported Wagmi 2 consumer. Upstream open ranges also select incompatible major versions.
            "@reown/appkit-adapter-wagmi>@wagmi/connectors": "6.0.1",
          },
        },
      }),
    );
    writeFileSync(
      join(consumerRoot, ".npmrc"),
      "auto-install-peers=false\nstrict-peer-dependencies=true\nhoist=false\n",
    );
    run(pnpm, ["install", "--prefer-offline", "--ignore-scripts", "--no-lockfile"], consumerRoot);

    const installedRoot = realpathSync(join(consumerRoot, "node_modules", sourceManifest.name));
    const manifest = readManifest(installedRoot);
    const optionalPeers = Object.keys(manifest.peerDependencies ?? {})
      .filter((name) => manifest.peerDependenciesMeta?.[name]?.optional)
      .sort();
    const report = JSON.parse(readFileSync(join(installedRoot, "dist/package-dependencies.json"), "utf8"));
    assert.deepEqual(optionalPeers, report.optionalPeers, "Packed optional peers differ from the built package graph");
    for (const name of report.buildOnlyDependencies) {
      assert(
        !manifest.dependencies?.[name] && !manifest.optionalDependencies?.[name] && !manifest.peerDependencies?.[name],
        `Packed build-only dependency must not install: ${name}`,
      );
    }
    assert(optionalPeers.length > 0, "The packed connector must declare optional peers");
    const installedPackages = readdirSync(join(consumerRoot, "node_modules/.pnpm"));
    for (const name of optionalPeers) {
      assert(!manifest.dependencies?.[name] && !manifest.optionalDependencies?.[name], `${name} must stay optional`);
      if (mode === "eth") {
        assert(
          !installedPackages.some((entry) => entry.startsWith(`${name.replaceAll("/", "+")}@`)),
          `ETH installed ${name}`,
        );
      }
    }
    const specifier = `${manifest.name}${mode === "eth" ? "/eth" : ""}`;
    const exports = manifest.exports[mode === "eth" ? "./eth" : "."];
    assert(existsSync(resolve(installedRoot, exports.types)), `Missing ${specifier} types export`);
    const runtimeCheck = join(consumerRoot, "check-runtime.mjs");
    writeFileSync(
      runtimeCheck,
      `import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as wallet from ${JSON.stringify(specifier)};
const require = createRequire(import.meta.url);
const walletRequire = createRequire(${JSON.stringify(join(installedRoot, "package.json"))});
for (const entry of [wallet, require(${JSON.stringify(specifier)})]) {
  for (const name of ["WalletProvider", "createWalletConfig"]) assert.equal(typeof entry[name], "function");
}
for (const name of ${JSON.stringify(optionalPeers)}) {
  ${
    mode === "eth"
      ? `assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" });
  assert.throws(() => walletRequire.resolve(name), { code: "MODULE_NOT_FOUND" });`
      : `assert(require.resolve(name));
  assert(walletRequire.resolve(name));`
  }
}
`,
    );
    run(process.execPath, [runtimeCheck], consumerRoot);

    const config =
      mode === "eth"
        ? `wallet.createWalletConfig({ networkConfigs: { ETH: {
  chainId: mainnet.id,
  chainName: mainnet.name,
  nativeCurrency: mainnet.nativeCurrency,
  rpcUrl: mainnet.rpcUrls.default.http[0],
  explorerUrl: mainnet.blockExplorers.default.url,
} } })`
        : `wallet.createWalletConfig({ chains: ["BTC"], disableTomo: true, networkConfigs: { BTC: {
  coinName: "Bitcoin", coinSymbol: "BTC", networkName: "Bitcoin",
  network: wallet.Network.MAINNET, mempoolApiUrl: "https://mempool.space",
} } })`;
    const fixture = join(consumerRoot, "main.ts");
    writeFileSync(
      fixture,
      `import { createElement } from "react";
import { createRoot } from "react-dom/client";
${mode === "eth" ? 'import { mainnet } from "viem/chains";' : ""}
import * as wallet from ${JSON.stringify(specifier)};
import ${JSON.stringify(`${manifest.name}/style.css`)};
const config = ${config};
if (config.length !== 1 || config[0].chain !== ${JSON.stringify(mode.toUpperCase())}) {
  throw new Error("Wallet configuration did not select the requested chain");
}
const root = createRoot(document.getElementById("root")!);
root.render(createElement(wallet.WalletProvider, {
  config, requiredChains: [], ${mode === "btc" ? "disableTomo: true," : ""}
  onError(error: Error) { throw error; },
}, createElement("span", { id: "ready" }, ${JSON.stringify(mode.toUpperCase())})));
`,
    );
    run(
      process.execPath,
      [
        resolve(consumerRoot, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "true", // Reown declarations fail strict checks for big.js and ViemUtil.
        "--target",
        "ES2022",
        "--module",
        "ESNext",
        "--moduleResolution",
        "Bundler",
        fixture,
      ],
      consumerRoot,
    );
    writeFileSync(
      join(consumerRoot, "index.html"),
      '<div id="root"></div><script type="module" src="/main.ts"></script>',
    );
    const { nodePolyfills } = createRequire(join(consumerRoot, "package.json"))("vite-plugin-node-polyfills");
    await build({
      configFile: false,
      root: consumerRoot,
      logLevel: "error",
      // Use the same browser polyfills as the existing apps.
      plugins: [nodePolyfills({ include: ["crypto"] })],
      build: { minify: false },
    });
    const server = await preview({
      configFile: false,
      root: consumerRoot,
      logLevel: "error",
      preview: { host: "127.0.0.1", port: 0 },
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    try {
      await page.goto(server.resolvedUrls.local[0]);
      await page.locator("#ready").waitFor({ timeout: 15_000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(errors, [], `Packed ${mode.toUpperCase()} consumer had runtime errors`);
      assert.equal(await page.locator("#ready").textContent(), mode.toUpperCase());
    } catch (error) {
      throw new Error(`Packed ${mode.toUpperCase()} consumer failed: ${errors.join("; ")}`, { cause: error });
    } finally {
      await page.close();
      await new Promise((resolve, reject) => server.httpServer.close((error) => (error ? reject(error) : resolve())));
    }
    console.log(`Packed ${mode.toUpperCase()} consumer verified.`);
  }
} finally {
  await browser?.close();
  rmSync(tempRoot, { recursive: true, force: true });
}
