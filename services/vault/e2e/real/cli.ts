/**
 * Interactive (and flag-driven) entry for the real-wallet E2E runner.
 *
 * Uses Node's built-in `node:readline/promises` (numbered-choice prompts) — no third-party prompt
 * dependency. Every prompt can be pre-supplied as a flag for non-interactive / programmatic runs:
 *
 *   pnpm exec tsx e2e/real/cli.ts --target=website --network=devnet --btc=unisat --eth=metamask \
 *     --action=connect [--data=real] [--delay=0] [--yes]
 *
 * Pegin accepts two optional extras: `--amount=<btc>` and `--vp=<name>`. When omitted, the CLI fetches
 * the network's real values (protocol minimum deposit + provider list) and offers them as defaults —
 * amount ⇒ minimum, provider ⇒ first available — prompting interactively. Mock mode shows as disabled.
 */
import { createInterface, type Interface } from "node:readline/promises";

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
import {
  fetchMinDepositBtc,
  fetchMinDepositForSplitBtc,
  fetchProviders,
} from "./peginParams";
import { runE2E } from "./run";

const MS_PER_SECOND = 1000;

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

    // Pegin extras. A flag always wins; otherwise, for the pegin action, fetch the network's real
    // values (like the balance pre-flight) and offer them as defaults — amount ⇒ protocol minimum,
    // provider ⇒ first available — prompting interactively when there's a TTY.

    // Split (pegin only): `--split` wins; else prompt (default = single vault). Resolved first because
    // the deposit minimum depends on it — a two-vault split needs a larger deposit than a single vault.
    let split = false;
    if (action === "pegin") {
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

    if (action === "pegin") {
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
        // --amount was given with --split: guard it against the fetched split minimum before launching
        // the browser (the form is the ultimate gate; this is a fast, actionable pre-flight fail).
        const minBtc = await fetchMinDepositForSplitBtc(network).catch(
          () => undefined,
        );
        if (minBtc !== undefined && Number(peginAmountBtc) < Number(minBtc))
          throw new Error(
            `--amount ${peginAmountBtc} is below the two-vault split minimum ${minBtc} sBTC for ${network}. Increase --amount to at least ${minBtc}, or drop --split.`,
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

    // Sign-conformance extra: explicit fixtures file (else the action auto-detects the newest pegin's).
    const fixturesPath =
      typeof flags.fixtures === "string" ? flags.fixtures : undefined;

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
