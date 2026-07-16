/**
 * Orchestrates one real-wallet E2E run from a resolved RunConfig:
 *   launch context + import both wallets → (localhost: dev server + env verify) → balance pre-flight →
 *   open the target URL → run the selected action → write artifacts. Always disposes the context and
 *   any spawned dev server; on failure captures a screenshot + DOM into the artifacts dir.
 */
import { ACTIONS_BY_ID } from "./actions";
import { createArtifacts } from "./artifacts";
import { fetchBorrowContext } from "./borrowParams";
import {
  BTC_WALLET_TO_CONNECTOR,
  ETH_WALLET_TO_CONNECTOR,
  NETWORKS,
  resolveTargetUrl,
  type RunConfig,
} from "./config";
import { launchWalletContext } from "./connector";
import { ensureDevServer, type DevServerHandle } from "./devServer";
import { fetchVaultCountCap } from "./peginParams";
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

    // Max-BTC-Vaults pre-flight (pegin only). A position has an on-chain cap on how many BTC Vaults it
    // can hold; the app blocks the deposit ("Maximum BTC Vaults reached") once full. Read the cap +
    // this depositor's current occupied-slot count from real data (contract + indexer) BEFORE the
    // browser deposit and refuse if the deposit (2 vaults for a split, else 1) would exceed it — so a
    // doomed pegin never launches. A fetch failure is non-fatal: the form's own gate backstops it (see
    // pegin.ts), so we warn and proceed rather than block on a transient read error.
    // Any pegin-first run performs a pegin too (`borrow --pegin-first` or
    // `repay --borrow-first --pegin-first`), so it's subject to the same cap.
    const willBorrow =
      config.action === "borrow" ||
      (config.action === "repay" && config.borrowFirst);
    const willPegin =
      config.action === "pegin" || (willBorrow && config.peginFirst);
    if (willPegin) {
      const cap = await fetchVaultCountCap(
        config.network,
        balances.eth.address,
      ).catch((error) => {
        artifacts.log(
          `⚠️ Could not pre-check the BTC-Vault count cap (${error instanceof Error ? error.message : error}); the form will gate it.`,
        );
        return undefined;
      });
      if (cap) {
        const needed = config.split ? 2 : 1;
        if (cap.maxVaults > 0 && cap.currentCount + needed > cap.maxVaults)
          throw new Error(
            `Maximum BTC Vaults reached: this position already holds ${cap.currentCount} of ${cap.maxVaults} BTC Vaults` +
              `${config.split ? " and a two-vault split needs 2 free slots" : ""}. Redeem/withdraw a vault or use a different ETH account before pegging in.`,
          );
        artifacts.log(
          `Vault-count cap: ${cap.currentCount}/${cap.maxVaults === 0 ? "∞ (unlimited)" : cap.maxVaults} slots used (this deposit needs ${needed}).`,
        );
      }
    }

    // Collateral pre-flight (any run that BORROWS against existing collateral: a `borrow` run, or a
    // `repay --borrow-first` run — both draw a loan before doing anything else). Read the position from
    // real data and refuse a doomed run BEFORE the browser if there's no borrowable collateral. A
    // `--pegin-first` run has no collateral yet (it pegs in during the run), so this gate is skipped for
    // it. A fetch failure is non-fatal: the disabled Borrow button + the form's validation backstop it,
    // so we warn. The borrow amount (a conservative fraction of the max) is resolved inside the action.
    const borrowsAgainstExistingCollateral = willBorrow && !config.peginFirst;
    if (borrowsAgainstExistingCollateral) {
      const borrowContext = await fetchBorrowContext(
        config.network,
        balances.eth.address,
      ).catch((error) => {
        artifacts.log(
          `⚠️ Could not pre-check borrow collateral (${error instanceof Error ? error.message : error}); the form will gate it.`,
        );
        return undefined;
      });
      if (borrowContext) {
        if (!borrowContext.hasCollateral)
          throw new Error(
            "No collateral to borrow against: this position holds no active BTC Vaults. Peg in first, or re-run with --pegin-first (or borrow with a different ETH account that has collateral).",
          );
        artifacts.log(
          `Borrow collateral: $${borrowContext.collateralUsd.toFixed(2)} (current debt $${borrowContext.currentDebtUsd.toFixed(2)}).`,
        );
      }
    }

    // Repay pre-flight (repay an EXISTING loan — not `--borrow-first`, which creates the loan during the
    // run). Read the position from real data and refuse a doomed run BEFORE the browser if there's no
    // debt to repay. A fetch failure is non-fatal: the disabled Repay button + the form's validation
    // backstop it, so we warn. The repay amount (a conservative fraction of the debt) is resolved inside
    // the action, which has the ETH address and logs it.
    if (config.action === "repay" && !config.borrowFirst) {
      const repayContext = await fetchBorrowContext(
        config.network,
        balances.eth.address,
      ).catch((error) => {
        artifacts.log(
          `⚠️ Could not pre-check repay debt (${error instanceof Error ? error.message : error}); the form will gate it.`,
        );
        return undefined;
      });
      if (repayContext) {
        if (repayContext.currentDebtUsd <= 0)
          throw new Error(
            "No debt to repay: this position holds no outstanding loan. Borrow first (--borrow-first), or repay with a different ETH account that has a loan.",
          );
        artifacts.log(
          `Repay debt: current debt $${repayContext.currentDebtUsd.toFixed(2)} (collateral $${repayContext.collateralUsd.toFixed(2)}).`,
        );
      }
    }

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
