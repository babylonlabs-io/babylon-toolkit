/**
 * Orchestrates one real-wallet E2E run from a resolved RunConfig:
 *   launch context + import both wallets → (localhost: dev server + env verify) → balance pre-flight →
 *   open the target URL → run the selected action → write artifacts. Always disposes the context and
 *   any spawned dev server; on failure captures a screenshot + DOM into the artifacts dir.
 */
import { ACTIONS_BY_ID } from "./actions";
import { createArtifacts } from "./artifacts";
import {
  BTC_WALLET_TO_CONNECTOR,
  ETH_WALLET_TO_CONNECTOR,
  NETWORKS,
  resolveTargetUrl,
  type RunConfig,
} from "./config";
import { launchWalletContext } from "./connector";
import { ensureDevServer, type DevServerHandle } from "./devServer";
import {
  balanceWarnings,
  checkBalances,
  formatBtc,
  formatEth,
} from "./preflight";
import { loadWalletSecrets } from "./secrets";
import { importWallets } from "./wallets";
import { maximizeWindow } from "./windowUtils";

export async function runE2E(config: RunConfig): Promise<void> {
  const action = ACTIONS_BY_ID[config.action];
  if (!action)
    throw new Error(`Action "${config.action}" is not implemented yet.`);
  // Mock mode has no recorded fixtures yet; without this guard `--data=mock` would drive the REAL
  // deployment while labeling the run "mock" — dangerous once value-moving actions (pegin/borrow) land.
  if (config.dataMode === "mock")
    throw new Error(
      "mock mode is not implemented yet — only --data=real runs today.",
    );

  const secrets = loadWalletSecrets();
  const artifacts = createArtifacts(config.action);
  artifacts.log(`Run config: ${JSON.stringify({ ...config })}`);

  const btcKey = BTC_WALLET_TO_CONNECTOR[config.btcWallet];
  const ethKey = ETH_WALLET_TO_CONNECTOR[config.ethWallet];

  let devServer: DevServerHandle | undefined;
  const context = await launchWalletContext([btcKey, ethKey], {
    maximize: true,
  });
  // launchWalletContext leaves exactly one about:blank page open — reuse it as our dapp page instead
  // of opening a second one (the importers open and close their own extension tabs on top of this).
  const page = context.pages()[0] ?? (await context.newPage());
  // Maximize the window FIRST — before importing wallets — so the whole run (including wallet
  // onboarding tabs) is easy to watch, not just once the dapp opens.
  await maximizeWindow(page);

  try {
    const imported = await importWallets(
      context,
      config.btcWallet,
      config.ethWallet,
      secrets,
      artifacts.log,
    );

    // Resolve where to point the browser.
    let baseUrl: string;
    if (config.target === "localhost") {
      devServer = await ensureDevServer(config.network, artifacts.log);
      baseUrl = devServer.baseUrl;
    } else {
      baseUrl = NETWORKS[config.network].websiteUrl;
    }
    const targetUrl = resolveTargetUrl(config, baseUrl);

    // Balance pre-flight (warn & proceed).
    const balances = await checkBalances(config, secrets.mnemonic);
    artifacts.log(
      `BTC ${balances.btc.address}: ${balances.btc.error ?? formatBtc(balances.btc.sats)}`,
    );
    artifacts.log(
      `ETH ${balances.eth.address}: ${balances.eth.error ?? formatEth(balances.eth.wei)}`,
    );
    for (const warning of balanceWarnings(balances))
      artifacts.log(`BALANCE WARNING: ${warning}`);

    artifacts.writeNetworkState({
      config,
      targetUrl,
      network: NETWORKS[config.network],
      // For a reused localhost server we cannot confirm which network it is serving — record it so the
      // artifact is honest (see devServer.ensureDevServer). Omitted (undefined) for the website target.
      devServerReused: devServer?.reused,
      imported,
      balances: {
        btc: {
          address: balances.btc.address,
          sats: balances.btc.sats.toString(),
          error: balances.btc.error,
        },
        eth: {
          address: balances.eth.address,
          wei: balances.eth.wei.toString(),
          error: balances.eth.error,
        },
      },
    });

    // Force dark before first paint: next-themes reads localStorage["theme"] (attribute="class",
    // default storageKey) on load, so seeding it in an init script makes the app start dark —
    // deterministic, unlike clicking the settings toggle (which is brittle and never closes on Escape).
    await context.addInitScript(() => {
      try {
        localStorage.setItem("theme", "dark");
      } catch {
        // storage unavailable — non-fatal; the run just renders in light theme.
      }
    });

    artifacts.log(`Opening ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    // Ground truth for verification = addresses derived locally from the mnemonic (full, canonical),
    // which the balance pre-flight already computed. The importers return what the wallet UI shows,
    // which can be truncated (e.g. MetaMask), so we do NOT use those for the assertion.
    await action.run({
      page,
      context,
      config,
      log: artifacts.log,
      artifactsDir: artifacts.dir,
      // Mock-only inter-step delay; 0 in real mode (the only mode that runs today, per the guard above).
      delayMs: config.delayMs,
      btc: { id: config.btcWallet, address: balances.btc.address },
      eth: { id: config.ethWallet, address: balances.eth.address },
    });

    artifacts.log(
      `✅ Action "${config.action}" completed. Artifacts: ${artifacts.dir}`,
    );
  } catch (error) {
    artifacts.log(
      `❌ Action "${config.action}" failed — capturing artifacts to ${artifacts.dir}`,
    );
    await artifacts.captureFailure(page, error);
    throw error;
  } finally {
    await context.close().catch(() => {});
    if (devServer) await devServer.dispose().catch(() => {});
  }
}
