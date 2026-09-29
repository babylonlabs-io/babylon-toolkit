import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmManifestPath = resolve(
  packageRoot,
  "../babylon-tbv-rust-wasm/package.json",
);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const tempRoot = mkdtempSync(join(tmpdir(), "ts-sdk-packed-consumer-"));
const consumerRoot = join(tempRoot, "consumer");
const tarball = join(tempRoot, "ts-sdk.tgz");
const childEnv = { ...process.env };
delete childEnv.NODE_PATH;

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, env: childEnv, stdio: "inherit" });
}

try {
  execFileSync(pnpm, ["pack", "--out", tarball], {
    cwd: packageRoot,
    env: childEnv,
  });
  mkdirSync(consumerRoot);
  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "ts-sdk-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@babylonlabs-io/ts-sdk": `file:${tarball}`,
          viem: "2.38.2",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerRoot, ".npmrc"),
    "auto-install-peers=false\nstrict-peer-dependencies=true\n",
  );
  run(
    pnpm,
    ["install", "--prefer-offline", "--ignore-scripts", "--no-lockfile"],
    consumerRoot,
  );

  const optionalPeerFixture = join(consumerRoot, "check-optional-peers.cjs");
  writeFileSync(
    optionalPeerFixture,
    `for (const dependency of [
  "@babylonlabs-io/babylon-tbv-rust-wasm",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "bitcoinjs-lib",
]) {
  try {
    const resolved = require.resolve(dependency);
    throw new Error(
      \`Packed ETH consumer unexpectedly installed \${dependency} at \${resolved}\`,
    );
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
  }
}
`,
  );
  run(process.execPath, [optionalPeerFixture], consumerRoot);

  const consumerRequire = createRequire(join(consumerRoot, "package.json"));
  const installedRoot = dirname(
    dirname(consumerRequire.resolve("@babylonlabs-io/ts-sdk")),
  );
  const manifest = JSON.parse(
    readFileSync(join(installedRoot, "package.json"), "utf8"),
  );
  const expectedWasmVersion = JSON.parse(
    readFileSync(wasmManifestPath, "utf8"),
  ).version;
  const ethExport = manifest.exports?.["./tbv/core/clients/eth"];
  const expectedEthExport = {
    types: "./dist/tbv/core/clients/eth/index.d.ts",
    require: "./dist/tbv/core/clients/eth/index.cjs",
    import: "./dist/tbv/core/clients/eth/index.js",
  };
  if (JSON.stringify(ethExport) !== JSON.stringify(expectedEthExport)) {
    throw new Error("Packed SDK has an unexpected ETH export map");
  }
  for (const target of Object.values(expectedEthExport)) {
    if (!existsSync(resolve(installedRoot, target))) {
      throw new Error(`Packed SDK is missing ${target}`);
    }
  }
  if (
    manifest.peerDependencies?.viem !== "^2.38.2" ||
    manifest.peerDependenciesMeta?.viem?.optional === true
  ) {
    throw new Error("Packed SDK must require viem ^2.38.2");
  }
  if (
    manifest.peerDependencies?.["@bitcoin-js/tiny-secp256k1-asmjs"] !==
      "2.2.3" ||
    manifest.peerDependencies?.["bitcoinjs-lib"] !== "6.1.7"
  ) {
    throw new Error("Packed SDK has an unexpected Bitcoin peer version");
  }
  for (const dependency of [
    "@babylonlabs-io/babylon-tbv-rust-wasm",
    "@bitcoin-js/tiny-secp256k1-asmjs",
    "bitcoinjs-lib",
  ]) {
    if (manifest.peerDependenciesMeta?.[dependency]?.optional !== true) {
      throw new Error(`Packed SDK must mark ${dependency} as an optional peer`);
    }
  }
  if (
    manifest.dependencies?.["@babylonlabs-io/babylon-tbv-rust-wasm"] ||
    manifest.optionalDependencies?.["@babylonlabs-io/babylon-tbv-rust-wasm"]
  ) {
    throw new Error("Packed SDK must not install the WASM engine");
  }
  const packedWasmVersion =
    manifest.peerDependencies?.["@babylonlabs-io/babylon-tbv-rust-wasm"];
  if (packedWasmVersion !== expectedWasmVersion) {
    throw new Error(
      `Packed SDK has WASM peer ${packedWasmVersion}; expected ${expectedWasmVersion}`,
    );
  }

  const typeFixture = join(consumerRoot, "check-types.ts");
  writeFileSync(
    typeFixture,
    `import {\n` +
      `  ViemPeginRegistrationClient,\n` +
      `  derivePeginVaultId,\n` +
      `  type RegisterPeginOnChainParams,\n` +
      `} from "@babylonlabs-io/ts-sdk/tbv/core/clients/eth";\n` +
      `const request: Pick<RegisterPeginOnChainParams, "depositorPayoutScriptPubKey"> = {\n` +
      `  depositorPayoutScriptPubKey: "0x51",\n` +
      `};\n` +
      `void request;\n` +
      `void ViemPeginRegistrationClient;\n` +
      `void derivePeginVaultId;\n`,
  );
  run(
    process.execPath,
    [
      resolve(packageRoot, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      typeFixture,
    ],
    consumerRoot,
  );

  const runtimeCheck =
    `const hash = "0x" + "11".repeat(32);\n` +
    `const depositor = "0x1111111111111111111111111111111111111111";\n` +
    `if (typeof sdk.ViemPeginRegistrationClient !== "function") throw new Error("Missing client");\n` +
    `if ("assertPayoutScriptMatchesPopKey" in sdk) throw new Error("Internal payout assertion is public");\n` +
    `if (!/^[0-9a-f]{64}$/.test(sdk.derivePeginVaultId(hash, depositor))) throw new Error("Bad vault ID");\n`;
  const esmFixture = join(consumerRoot, "check-esm.mjs");
  writeFileSync(
    esmFixture,
    `import * as sdk from "@babylonlabs-io/ts-sdk/tbv/core/clients/eth";\n${runtimeCheck}`,
  );
  run(process.execPath, [esmFixture], consumerRoot);

  const cjsFixture = join(consumerRoot, "check-cjs.cjs");
  writeFileSync(
    cjsFixture,
    `const sdk = require("@babylonlabs-io/ts-sdk/tbv/core/clients/eth");\n${runtimeCheck}`,
  );
  run(process.execPath, [cjsFixture], consumerRoot);

  console.log("Packed ETH consumer verified without Bitcoin or WASM peers.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
