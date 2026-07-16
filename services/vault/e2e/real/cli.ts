/**
 * Interactive (and flag-driven) entry for the real-wallet E2E runner.
 *
 * Uses Node's built-in `node:readline/promises` (numbered-choice prompts) — no third-party prompt
 * dependency. Launch it via the package script (from the repo root):
 *
 *   pnpm --filter vault run e2e:cli               # interactive menu (prompts for every choice)
 *
 * On a clean checkout this is the only command needed: the run self-provisions before launching the
 * browser — it installs Playwright's Chromium if missing and downloads/updates the wallet extensions
 * (see `provision.ts`), so no separate `playwright install` / `extensions:download` step is required.
 *
 * Every prompt can be pre-supplied as a flag for a non-interactive / programmatic run (flags forward
 * through the script — no `--` separator needed):
 *
 *   pnpm --filter vault run e2e:cli --target=website --network=devnet --btc=unisat --eth=metamask \
 *     --action=connect [--data=real] [--delay=0] [--yes]
 *
 * Pegin accepts two optional extras: `--amount=<btc>` and `--vp=<name>`. When omitted, the CLI fetches
 * the network's real values (protocol minimum deposit + provider list) and offers them as defaults —
 * amount ⇒ minimum, provider ⇒ first available — prompting interactively. Mock mode shows as disabled.
 *
 * Borrow accepts `--pegin-first` (peg in fresh collateral before borrowing — then also honors the pegin
 * extras above), `--borrow-token=<symbol>` (from the live borrowable list; default = first), and
 * `--borrow-amount=<n>|max` (default = a conservative fraction of the computed max, resolved in run.ts).
 *
 * Repay accepts `--borrow-first` (borrow against existing collateral, then repay the new loan — then
 * also honors the borrow extras above), `--repay-token=<symbol>` (from the depositor's outstanding
 * loans; default = the sole loan, or the borrowed token under --borrow-first) and `--repay-amount=<n>|max`
 * (`max` clicks the form's Max for a full clear; default = a conservative fraction of the debt).
 *
 * Withdraw releases active BTC-Vault collateral (a single on-chain tx; the vault provider drives the
 * Bitcoin payout afterward). It chains prerequisite legs via the cascade `--pegin-first ⟹ --borrow-first
 * ⟹ --repay-first` (a deeper flag implies the shallower legs): `--repay-first` repays outstanding debt in
 * full first; `--borrow-first` borrows (honoring the borrow extras) then repays that loan; `--pegin-first`
 * pegs in fresh collateral (honoring the pegin extras, incl. `--split`) then borrows + repays — the full
 * pegin → borrow → repay → withdraw cycle. `--withdraw-all` releases every selectable vault (default = a
 * single vault, keeping the position alive).
 *
 * Resume recovers an interrupted peg-in from the dashboard's Pending Deposits UI (Submit WOTS Key → Sign
 * Payouts → Activate). By default it resumes an already-pending deposit (`--txid=<prePeginTxid>` targets a
 * specific one, else the first actionable); `--interrupt-fresh` pegs in a fresh deposit, reloads after
 * Pre-PegIn broadcast, and resumes it — a self-contained run (then also honors the pegin extras above).
 */
import { createInterface, type Interface } from "node:readline/promises";

import { fetchBorrowableReserves } from "./borrowParams";
import {
  ACTIONS,
  BTC_WALLETS,
  ETH_WALLETS,
  type ActionId,
  type BtcWalletId,
  type DataMode,
  type EthWalletId,
  type NetworkName,
  type RunConfig,
  type Target,
} from "./config";
import { deriveEthAddress } from "./connector";
import {
  fetchMinDepositBtc,
  fetchMinDepositForSplitBtc,
  fetchProviders,
} from "./peginParams";
import { fetchRepayableDebts } from "./repayParams";
import { runE2E } from "./run";
import { loadWalletSecrets } from "./secrets";
import { MS_PER_SECOND } from "./timing";

interface Choice<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    flags[key] = rest.length ? rest.join("=") : true;
  }
  return flags;
}

/** Numbered single-select. Rejects disabled entries; empty input picks the first enabled option. */
async function select<T extends string>(
  rl: Interface,
  title: string,
  choices: Choice<T>[],
): Promise<T> {
  const firstEnabled = choices.find((c) => !c.disabled);
  if (!firstEnabled) throw new Error(`No selectable options for "${title}"`);
  // eslint-disable-next-line no-console
  console.log(`\n${title}`);
  choices.forEach((c, i) => {
    const tag = c.disabled
      ? " (coming soon)"
      : c.value === firstEnabled.value
        ? " (default)"
        : "";
    const hint = c.hint ? ` — ${c.hint}` : "";
    // eslint-disable-next-line no-console
    console.log(`  ${i + 1}) ${c.label}${tag}${hint}`);
  });
  for (;;) {
    const raw = (await rl.question("> ")).trim();
    if (!raw) return firstEnabled.value;
    const idx = Number(raw) - 1;
    const chosen = choices[idx];
    if (!chosen) {
      // eslint-disable-next-line no-console
      console.log("Invalid choice, try again.");
      continue;
    }
    if (chosen.disabled) {
      // eslint-disable-next-line no-console
      console.log(
        `"${chosen.label}" is not available yet — pick an enabled option.`,
      );
      continue;
    }
    return chosen.value;
  }
}

/** Coerce a boolean flag: `--yes`, `--yes=true`, `--yes=1`, `--yes=yes` all mean true. */
function flagBool(flag: string | boolean | undefined): boolean {
  if (flag === true) return true;
  if (typeof flag === "string")
    return ["", "true", "1", "yes"].includes(flag.toLowerCase());
  return false;
}

/** Validate an OPTIONAL choice flag: undefined if absent, the value if valid, else throw. */
function optionalChoice<T extends string>(
  flag: string | boolean | undefined,
  valid: readonly T[],
  name: string,
): T | undefined {
  if (flag === undefined || flag === false) return undefined;
  if (typeof flag !== "string")
    throw new Error(`--${name} expects a value, e.g. --${name}=${valid[0]}`);
  if (!(valid as readonly string[]).includes(flag))
    throw new Error(
      `Invalid --${name} "${flag}"; expected one of: ${valid.join(", ")}`,
    );
  return flag as T;
}

async function resolveConfig(
  flags: Record<string, string | boolean>,
): Promise<RunConfig> {
  // Non-interactive when --yes is passed or stdin isn't a TTY (programmatic/CI). Then every field must
  // come from a flag, except the optional ones which take their defaults (data=real, delay=0).
  const interactive = !flagBool(flags.yes) && Boolean(process.stdin.isTTY);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Valid values derived from config so the flag validator can't drift from the interactive menu.
  const TARGETS: readonly Target[] = ["website", "localhost"];
  const NETWORKS_LIST: readonly NetworkName[] = ["devnet", "testnet"];
  // Only enabled wallets are selectable (disabled ones — e.g. OneKey — are hidden + rejected).
  const enabledBtcWallets = BTC_WALLETS.filter((w) => w.enabled);
  const enabledEthWallets = ETH_WALLETS.filter((w) => w.enabled);
  const BTC_IDS = enabledBtcWallets.map((w) => w.id);
  const ETH_IDS = enabledEthWallets.map((w) => w.id);
  const ACTION_IDS = ACTIONS.map((a) => a.id);

  /**
   * A required field: use the flag if supplied (validated — throws "Invalid" on a bad value or a
   * value-less flag), else prompt (interactive), else the required-field error.
   */
  async function pick<T extends string>(
    flag: string | boolean | undefined,
    valid: readonly T[],
    prompt: () => Promise<T>,
    name: string,
  ): Promise<T> {
    const chosen = optionalChoice<T>(flag, valid, name);
    if (chosen) return chosen;
    if (interactive) return prompt();
    throw new Error(`Missing --${name} (required for a non-interactive run).`);
  }

  try {
    const target = await pick<Target>(
      flags.target,
      TARGETS,
      () =>
        select<Target>(rl, "1. Where are we running against?", [
          { value: "website", label: "Website (public deployment)" },
          { value: "localhost", label: "Localhost (local dev server)" },
        ]),
      "target",
    );

    const network = await pick<NetworkName>(
      flags.network,
      NETWORKS_LIST,
      () =>
        select<NetworkName>(rl, "2. Which network?", [
          { value: "devnet", label: "devnet" },
          { value: "testnet", label: "testnet" },
        ]),
      "network",
    );

    const btcWallet = await pick<BtcWalletId>(
      flags.btc,
      BTC_IDS,
      () =>
        select<BtcWalletId>(
          rl,
          "3. BTC wallet",
          enabledBtcWallets.map((w) => ({ value: w.id, label: w.label })),
        ),
      "btc",
    );

    const ethWallet = await pick<EthWalletId>(
      flags.eth,
      ETH_IDS,
      () =>
        select<EthWalletId>(
          rl,
          "4. ETH wallet",
          enabledEthWallets.map((w) => ({ value: w.id, label: w.label })),
        ),
      "eth",
    );

    const action = await pick<ActionId>(
      flags.action,
      ACTION_IDS,
      () =>
        select<ActionId>(
          rl,
          "5. Action",
          ACTIONS.map((a) => ({
            value: a.id,
            label: a.label,
            disabled: !a.enabled,
          })),
        ),
      "action",
    );

    // Optional: default to real/0 when not supplied (no error non-interactively).
    const dataMode =
      optionalChoice<DataMode>(flags.data, ["real", "mock"], "data") ??
      (interactive
        ? await select<DataMode>(rl, "6. Data mode", [
            { value: "real", label: "Real data" },
            {
              value: "mock",
              label: "Mock (recorded responses)",
              disabled: true,
              hint: "future",
            },
          ])
        : "real");

    let delayMs = 0;
    if (dataMode === "mock") {
      const raw =
        typeof flags.delay === "string"
          ? flags.delay
          : interactive
            ? await rl.question(
                "\n7. Artificial delay between waits (seconds) [0]: ",
              )
            : "0";
      delayMs = Math.max(0, Math.round((Number(raw) || 0) * MS_PER_SECOND));
    }

    // ── Prerequisite legs (which actions run before the primary one) ──────────────
    // `borrowFirst`/`peginFirst`/`repayFirst` gate the pegin + borrow extras below and the run.ts
    // pre-flights. Resolved BEFORE those because they decide whether a borrow (and thus a possible pegin,
    // and the loan-token lookup) happens at all.
    //   repay:    --borrow-first (borrow a new loan, then repay it), optionally with --pegin-first.
    //   withdraw: cascade --pegin-first ⟹ --borrow-first ⟹ --repay-first — a deeper flag implies every
    //             shallower leg (pegin → borrow → repay → withdraw).
    let borrowFirst = false;
    let peginFirst = false;
    let repayFirst = false;

    if (action === "repay") {
      // borrow-first: flag wins, else prompt (default = repay an existing loan).
      if (flags["borrow-first"] !== undefined) {
        borrowFirst = flagBool(flags["borrow-first"]);
      } else if (interactive) {
        borrowFirst =
          (await select<"existing" | "borrow">(rl, "What to repay", [
            { value: "existing", label: "Repay an existing loan" },
            { value: "borrow", label: "Borrow first, then repay it" },
          ])) === "borrow";
      }
    }

    if (action === "withdraw") {
      // Cascade: a flag at any depth implies every shallower leg.
      peginFirst = flagBool(flags["pegin-first"]);
      borrowFirst = flagBool(flags["borrow-first"]) || peginFirst;
      repayFirst = flagBool(flags["repay-first"]) || borrowFirst;
      // No chain flag → offer the common repay-first choice interactively (deeper chains are flag-only).
      if (!repayFirst && interactive)
        repayFirst =
          (await select<"asis" | "repay">(rl, "Withdraw collateral", [
            { value: "asis", label: "Withdraw against the current position" },
            {
              value: "repay",
              label: "Repay outstanding debt first, then withdraw",
            },
          ])) === "repay";
    }

    // Peg in first, or borrow against existing collateral? Applies to any run that draws a loan — a
    // `borrow` run, or a `repay`/`withdraw` with --borrow-first. Withdraw already resolved `peginFirst`
    // above via the cascade; borrow/repay resolve it here (flag wins, else prompt, default = reuse).
    const willBorrow =
      action === "borrow" ||
      ((action === "repay" || action === "withdraw") && borrowFirst);
    if (willBorrow && action !== "withdraw") {
      if (flags["pegin-first"] !== undefined) {
        peginFirst = flagBool(flags["pegin-first"]);
      } else if (interactive) {
        peginFirst =
          (await select<"reuse" | "pegin">(rl, "Collateral for the borrow", [
            {
              value: "reuse",
              label: "Borrow against existing BTC Vaults (collateral)",
            },
            { value: "pegin", label: "Peg in first, then borrow" },
          ])) === "pegin";
      }
    }

    // Resume extras (resume-only). `--interrupt-fresh` makes the run self-contained: peg in a fresh
    // deposit, interrupt it after Pre-PegIn broadcast, then resume from the dashboard — so it needs the
    // pegin params below. `--txid` targets a specific pending deposit when several are in flight.
    const interruptFresh =
      action === "resume" && flagBool(flags["interrupt-fresh"]);
    const resumeTxid =
      action === "resume" && typeof flags.txid === "string"
        ? flags.txid
        : undefined;

    // Pegin extras. A flag always wins; otherwise fetch the network's real values (like the balance
    // pre-flight) and offer them as defaults — amount ⇒ minimum, provider ⇒ first available. Collected
    // for a `pegin` run, any pegin-first borrow (`borrow --pegin-first` or
    // `repay --borrow-first --pegin-first`), AND `resume --interrupt-fresh` (which pegs in then resumes).
    const needsPeginParams =
      action === "pegin" ||
      (willBorrow && peginFirst) ||
      (action === "resume" && interruptFresh);

    // Split: `--split` wins; else prompt (default = single vault). Resolved first because the deposit
    // minimum depends on it — a two-vault split needs a larger deposit than a single vault.
    let split = false;
    if (needsPeginParams) {
      if (flags.split !== undefined) {
        split = flagBool(flags.split);
      } else if (interactive) {
        split =
          (await select<"single" | "split">(rl, "Deposit type", [
            { value: "single", label: "Single-vault deposit" },
            { value: "split", label: "Two-vault split deposit" },
          ])) === "split";
      }
    }

    let peginAmountBtc =
      typeof flags.amount === "string" ? flags.amount : undefined;
    if (peginAmountBtc !== undefined) {
      const parsed = Number(peginAmountBtc);
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error(
          `--amount must be a positive number of BTC (got "${peginAmountBtc}")`,
        );
    }
    let peginProvider = typeof flags.vp === "string" ? flags.vp : undefined;

    if (needsPeginParams) {
      // The deposit minimum depends on the deposit type: the single-vault protocol minimum, or the
      // (larger) two-vault split minimum computed from Aave risk params + the SDK split math.
      const fetchMin = split ? fetchMinDepositForSplitBtc : fetchMinDepositBtc;
      const minLabel = split ? "two-vault split minimum" : "protocol minimum";

      // Amount: default to the fetched minimum for this network + deposit type (unless --amount given).
      if (peginAmountBtc === undefined) {
        const minBtc = await fetchMin(network).catch((error) => {
          // eslint-disable-next-line no-console
          console.warn(
            `\nCould not fetch the ${minLabel} (${error instanceof Error ? error.message : error}); the run will fall back to the form's minimum.`,
          );
          return undefined;
        });
        if (interactive) {
          const hint = minBtc ? `${minBtc} = ${minLabel}` : minLabel;
          const raw = (
            await rl.question(`\nPegin amount in BTC [${hint}]: `)
          ).trim();
          peginAmountBtc = raw || minBtc;
        } else {
          peginAmountBtc = minBtc; // non-interactive: use the fetched minimum
        }
      } else if (split) {
        // --amount was given with --split: a best-effort pre-flight heads-up, NOT a hard gate. The
        // estimate uses the reserve's current dynamic config key (not the depositor's position key), so
        // it can differ slightly from the form — the live form is the authoritative, position-aware gate
        // and fails loudly at the split selector within ~30-60s if the amount is truly too low. So we
        // WARN rather than throw: an approximate estimate must never wrongly reject a valid run, and a
        // failed fetch must not silently skip the heads-up.
        const minBtc = await fetchMinDepositForSplitBtc(network).catch(
          (error) => {
            // eslint-disable-next-line no-console
            console.warn(
              `\n⚠️ Could not fetch the two-vault split minimum (${error instanceof Error ? error.message : error}); skipping the pre-flight amount check — the form will gate it.`,
            );
            return undefined;
          },
        );
        if (minBtc !== undefined && Number(peginAmountBtc) < Number(minBtc))
          // eslint-disable-next-line no-console
          console.warn(
            `\n⚠️ --amount ${peginAmountBtc} looks below the two-vault split minimum (~${minBtc} sBTC estimated for ${network}); the form will confirm the exact position-aware threshold and stop the run there if it's genuinely too low.`,
          );
      }

      // Provider: interactive menu from the live list (default = first available); --vp overrides.
      if (peginProvider === undefined && interactive) {
        const providers = await fetchProviders(network).catch((error) => {
          // eslint-disable-next-line no-console
          console.warn(
            `\nCould not fetch providers (${error instanceof Error ? error.message : error}); the run will pick the first available.`,
          );
          return [];
        });
        const available = providers.filter((p) => p.available);
        if (available.length > 0)
          peginProvider = await select(
            rl,
            "Vault provider",
            available.map((p) => ({ value: p.name, label: p.name })),
          );
      }
    }

    // Borrow extras: token (from the live borrowable list) + an explicit amount passthrough. Collected
    // for any run that borrows (`willBorrow`: a `borrow` run, or a `repay`/`withdraw` --borrow-first). The amount
    // DEFAULT (a conservative fraction of the max) needs the depositor's ETH address, which isn't known
    // until wallet import — so it's resolved later; here we only carry an explicit --borrow-amount
    // (a number, or "max" for the form's Max button) through.
    let borrowToken =
      typeof flags["borrow-token"] === "string"
        ? flags["borrow-token"]
        : undefined;
    const borrowAmount =
      typeof flags["borrow-amount"] === "string"
        ? flags["borrow-amount"]
        : undefined;
    if (borrowAmount !== undefined && borrowAmount.toLowerCase() !== "max") {
      const parsed = Number(borrowAmount);
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error(
          `--borrow-amount must be a positive number of tokens or "max" (got "${borrowAmount}")`,
        );
    }
    if (willBorrow) {
      // Fetch the live borrowable list up front so we can VALIDATE an explicit --borrow-token before a
      // (possibly funded, pegin-first) run — an unselectable token would otherwise only surface after
      // the peg-in, wasting it. When the token isn't given, pick from the list (menu / first).
      const reserves = await fetchBorrowableReserves(network).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn(
          `\nCould not fetch borrowable tokens (${error instanceof Error ? error.message : error}); skipping token validation — the borrow form will gate it.`,
        );
        return [];
      });
      if (borrowToken !== undefined) {
        const match = reserves.find(
          (r) => r.symbol.toLowerCase() === borrowToken!.toLowerCase(),
        );
        if (reserves.length > 0 && !match)
          throw new Error(
            `--borrow-token "${borrowToken}" is not a borrowable reserve on ${network} (available: ${reserves.map((r) => r.symbol).join(", ")}).`,
          );
        // Canonicalize to the reserve's exact symbol casing when we could validate it.
        if (match) borrowToken = match.symbol;
      } else if (reserves.length > 0) {
        borrowToken = interactive
          ? await select(
              rl,
              "Borrow token",
              reserves.map((r) => ({
                value: r.symbol,
                label: `${r.symbol} — ${r.name}`,
              })),
            )
          : reserves[0].symbol;
      }
    }

    // Repay extras: token (from the depositor's outstanding loans) + an explicit amount passthrough.
    // Mirrors borrow: the amount DEFAULT (a conservative fraction of the debt) needs the ETH address, so
    // it's resolved later in the action; here we only carry an explicit --repay-amount through.
    let repayToken =
      typeof flags["repay-token"] === "string"
        ? flags["repay-token"]
        : undefined;
    let repayAmount =
      typeof flags["repay-amount"] === "string"
        ? flags["repay-amount"]
        : undefined;
    if (repayAmount !== undefined && repayAmount.toLowerCase() !== "max") {
      const parsed = Number(repayAmount);
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error(
          `--repay-amount must be a positive number of tokens or "max" (got "${repayAmount}")`,
        );
    }
    // Withdraw with any repay leg clears the debt in full by default so collateral is no longer health-
    // factor-gated (an explicit --repay-amount still wins if a partial repay + withdraw is intended).
    if (action === "withdraw" && repayFirst && repayAmount === undefined)
      repayAmount = "max";
    // Resolve/validate the loan token for any run that repays an EXISTING loan: `repay` or `withdraw
    // --repay-first`. Excludes --borrow-first (repay OR withdraw), whose loan is created during the run —
    // that case defaults `repayToken` to the borrowed token below instead.
    const resolveExistingLoanToken =
      (action === "repay" && !borrowFirst) ||
      (action === "withdraw" && repayFirst && !borrowFirst);
    if (resolveExistingLoanToken) {
      // Fetch the depositor's outstanding loans up front so an explicit --repay-token is VALIDATED
      // before the run, and so an unspecified token can be picked from the list (menu / sole loan).
      // Unlike borrow's address-independent reserve list, the loans are position-specific, so we derive
      // the ETH address from the wallet mnemonic (the same derivation the balance pre-flight uses) — the
      // real run in run.ts re-derives it as ground truth. Best-effort: any read/derivation failure warns
      // and skips validation (the disabled Repay button + form validation still gate the run).
      const debts = await (async () =>
        fetchRepayableDebts(
          network,
          deriveEthAddress(loadWalletSecrets().mnemonic),
        ))().catch((error) => {
        // eslint-disable-next-line no-console
        console.warn(
          `\nCould not fetch outstanding loans (${error instanceof Error ? error.message : error}); skipping token validation — the repay form will gate it.`,
        );
        return [];
      });
      if (repayToken !== undefined) {
        const match = debts.find(
          (d) => d.symbol.toLowerCase() === repayToken!.toLowerCase(),
        );
        if (debts.length > 0 && !match)
          throw new Error(
            `--repay-token "${repayToken}" is not an outstanding loan on ${network} (you owe on: ${debts.map((d) => d.symbol).join(", ") || "nothing"}).`,
          );
        // Canonicalize to the reserve's exact symbol casing when we could validate it.
        if (match) repayToken = match.symbol;
      } else if (debts.length > 0) {
        repayToken =
          debts.length === 1
            ? debts[0].symbol
            : interactive
              ? await select(
                  rl,
                  "Repay token",
                  debts.map((d) => ({
                    value: d.symbol,
                    label: `${d.symbol} — ${d.debtTokens} owed`,
                  })),
                )
              : debts[0].symbol;
      }
    }
    // For a --borrow-first run (`repay` or `withdraw`), repay the token we just borrowed unless the user
    // overrode --repay-token.
    if (
      (action === "repay" || action === "withdraw") &&
      borrowFirst &&
      repayToken === undefined
    )
      repayToken = borrowToken;

    // Sign-conformance extra: explicit fixtures file (else the action auto-detects the newest pegin's).
    const fixturesPath =
      typeof flags.fixtures === "string" ? flags.fixtures : undefined;

    // Withdraw extra: release every selectable vault (default = a single vault, keeping the position alive).
    const withdrawAll =
      action === "withdraw" && flagBool(flags["withdraw-all"]);

    return {
      target,
      network,
      btcWallet,
      ethWallet,
      action,
      dataMode,
      delayMs,
      peginAmountBtc,
      peginProvider,
      split,
      fixturesPath,
      peginFirst,
      borrowToken,
      borrowAmount,
      borrowFirst,
      repayToken,
      repayAmount,
      repayFirst,
      withdrawAll,
      resumeTxid,
      interruptFresh,
    };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const config = await resolveConfig(flags);
  // eslint-disable-next-line no-console
  console.log(`\nRun summary:\n${JSON.stringify(config, null, 2)}\n`);
  await runE2E(config);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    `\nRun failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
