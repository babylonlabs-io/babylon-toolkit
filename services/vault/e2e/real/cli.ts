/**
 * Interactive (and flag-driven) entry for the real-wallet E2E runner.
 *
 * Uses Node's built-in `node:readline/promises` (numbered-choice prompts) — no third-party prompt
 * dependency. Every prompt can be pre-supplied as a flag for non-interactive / programmatic runs:
 *
 *   pnpm exec tsx e2e/real/cli.ts --target=website --network=devnet --btc=unisat --eth=metamask \
 *     --action=connect [--data=real] [--delay=0] [--headless] [--yes]
 *
 * Only `connect` + `real` are implemented; other actions and mock mode show as disabled.
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

function asChoice<T extends string>(
  flag: string | boolean | undefined,
  valid: readonly T[],
): T | undefined {
  return typeof flag === "string" && (valid as readonly string[]).includes(flag)
    ? (flag as T)
    : undefined;
}

async function resolveConfig(
  flags: Record<string, string | boolean>,
): Promise<RunConfig> {
  // Non-interactive when --yes is passed or stdin isn't a TTY (programmatic/CI). Then every field must
  // come from a flag, except the optional ones which take their defaults (data=real, delay=0).
  const interactive = flags.yes !== true && Boolean(process.stdin.isTTY);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  /** Flag value, else prompt (interactive), else the required-field error. */
  async function pick<T extends string>(
    flagVal: T | undefined,
    prompt: () => Promise<T>,
    name: string,
  ): Promise<T> {
    if (flagVal) return flagVal;
    if (interactive) return prompt();
    throw new Error(`Missing --${name} (required for a non-interactive run).`);
  }

  try {
    const target = await pick<Target>(
      asChoice<Target>(flags.target, ["localhost", "website"]),
      () =>
        select<Target>(rl, "1. Where are we running against?", [
          { value: "website", label: "Website (public deployment)" },
          { value: "localhost", label: "Localhost (local dev server)" },
        ]),
      "target",
    );

    const network = await pick<NetworkName>(
      asChoice<NetworkName>(flags.network, ["devnet", "testnet"]),
      () =>
        select<NetworkName>(rl, "2. Which network?", [
          { value: "devnet", label: "devnet" },
          { value: "testnet", label: "testnet" },
        ]),
      "network",
    );

    const btcWallet = await pick<BtcWalletId>(
      asChoice<BtcWalletId>(flags.btc, ["unisat", "okx", "onekey"]),
      () =>
        select<BtcWalletId>(
          rl,
          "3. BTC wallet",
          BTC_WALLETS.map((w) => ({ value: w.id, label: w.label })),
        ),
      "btc",
    );

    const ethWallet = await pick<EthWalletId>(
      asChoice<EthWalletId>(flags.eth, ["metamask"]),
      () =>
        select<EthWalletId>(
          rl,
          "4. ETH wallet",
          ETH_WALLETS.map((w) => ({ value: w.id, label: w.label })),
        ),
      "eth",
    );

    const action = await pick<ActionId>(
      asChoice<ActionId>(flags.action, [
        "connect",
        "pegin",
        "borrow",
        "repay",
        "withdraw",
      ]),
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
      asChoice<DataMode>(flags.data, ["real", "mock"]) ??
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

    return {
      target,
      network,
      btcWallet,
      ethWallet,
      action,
      dataMode,
      delayMs,
      headless: flags.headless === true,
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
