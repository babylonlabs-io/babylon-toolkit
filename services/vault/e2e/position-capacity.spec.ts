/**
 * A deposit into a full position stops before anything is signed.
 *
 * The deposit form's cap check reads a cached limit and an indexer count, so
 * it can pass a position that has since filled up. The deposit flow therefore
 * asks the application again, from chain, before the first signing prompt:
 * `allowedToDeposit` sized to the deposit plus the depositor's other
 * registered, unactivated vaults (read from the registry's
 * `getDepositorVaultIds`).
 *
 * The recorded backend serves everything up to the "Sign Transaction" click.
 * The check's own reads are stated by this spec instead: the chain head it
 * pins them to (the recording ends before any was read), the depositor has no
 * other vaults, and the application refuses. The form's own cap check never
 * reads `allowedToDeposit`, so the form lets the deposit through - the
 * stale-snapshot case - and the refusal must come from the flow.
 *
 * The injected wallets never sign, so a deposit the check let through would
 * fail at the first signing call instead. Every signing call of either wallet
 * after Sign is logged and must not happen. The injected ETH wallet already
 * reports the app's chain, so no chain switch is asked here; the check's place
 * before the chain switch is pinned by `useDepositFlow.test.tsx`. The case
 * where the position has room cannot be walked here (the injected wallets
 * never sign); the real-wallet CLI covers it (`e2e/real`, `--action=pegin`).
 */

import { expect, test } from "@playwright/test";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  toFunctionSelector,
  toHex,
  type Hex,
} from "viem";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import {
  RECORDED_DEPLOYMENT,
  RECORDED_DEPOSITOR,
} from "./fixtures/replay/contracts";
import { FLUID_CTA_SELECTOR } from "./real/actions/selectors";
import {
  assertRecordingCovered,
  blockOffsiteRequests,
  recordedPageWallets,
  STEP_MARKER,
} from "./visual/capture";

const GET_DEPOSITOR_VAULT_IDS_ABI = parseAbi([
  "function getDepositorVaultIds(address depositor) view returns (bytes32[] vaultIds)",
]);
const ALLOWED_TO_DEPOSIT_ABI = parseAbi([
  "function allowedToDeposit(address vaultReceiver, uint256 nVaultsToDeposit, uint256 amountToDeposit) view returns (bool)",
]);

/**
 * The chain head the check reads, and pins its reads to less a small lag. The
 * replay answers a contract read the same at any block, so any head will do.
 */
const STATED_CHAIN_HEAD = 1_000n;

/**
 * Above the deployment's minimum deposit and below the recorded wallet's
 * balance and the two-vault minimum, so the form submits one vault (the same
 * window `visual/depositFlow.visual.spec.ts` submits in).
 */
const AMOUNT_TO_SUBMIT_BTC = "0.02";
const AMOUNT_TO_SUBMIT_SATS = 2_000_000n;
/** One vault: the amount is below the two-vault minimum. */
const VAULTS_IN_DEPOSIT = 1n;

/** `COPY.deposit.form.selectVaultProvider`, matched as the real-wallet CLI does. */
const SELECT_PROVIDER_LABEL = "Select vault provider";
const SELECTABLE_PROVIDER_ROW = "button[aria-pressed]:not([disabled])";
/** `COPY.deposit.progress.buttons.signTransaction`. */
const SIGN_TRANSACTION_LABEL = "Sign Transaction";
/** `COPY.deposit.errors.positionCapacityExceeded.title`. */
const POSITION_FULL_TITLE = "Not enough room in your position";
/** `COPY.deposit.progress.buttons.close` / `.retry`. */
const CLOSE_LABEL = "Close";
const RETRY_LABEL = "Retry";

/** The fake UniSat's methods that would put a prompt in front of a depositor. */
const UNISAT_PROMPTING_METHODS = [
  "deriveContextHash",
  "signPsbt",
  "signPsbts",
  "signMessage",
] as const;
/** The ETH provider's methods that would ask a depositor to sign. */
const ETH_PROMPTING_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
] as const;
/** Page global the wrapped methods log their calls to. */
const WALLET_PROMPT_LOG = "__positionCapacityWalletPrompts";

test("a deposit into a full position stops before any signing prompt", async ({
  page,
}) => {
  await blockOffsiteRequests(page);
  const backend = await installRecordedBackend(page, {
    statedMethods: { eth_blockNumber: toHex(STATED_CHAIN_HEAD) },
    statedAnswers: [
      {
        target: RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY,
        selector: toFunctionSelector(GET_DEPOSITOR_VAULT_IDS_ABI[0]),
        answer: () =>
          encodeFunctionResult({
            abi: GET_DEPOSITOR_VAULT_IDS_ABI,
            functionName: "getDepositorVaultIds",
            result: [],
          }),
      },
      {
        target: RECORDED_DEPLOYMENT.AAVE_ADAPTER,
        selector: toFunctionSelector(ALLOWED_TO_DEPOSIT_ABI[0]),
        answer: () =>
          encodeFunctionResult({
            abi: ALLOWED_TO_DEPOSIT_ABI,
            functionName: "allowedToDeposit",
            result: false,
          }),
      },
    ],
  });
  await injectPageWallets(page, recordedPageWallets());
  // Runs after the injection above (init scripts run in the order added), so
  // it wraps the methods the fake UniSat defines, and the ETH provider
  // answers this script's own EIP-6963 request at once. Every ETH request is
  // logged, so the log also shows that the wrapper is live.
  await page.addInitScript(
    ([unisatMethods, logName]: readonly [readonly string[], string]) => {
      const calls: string[] = [];
      Object.defineProperty(window, logName, { value: calls });

      const wallet = (window as unknown as { unisat?: Record<string, unknown> })
        .unisat;
      if (wallet)
        for (const method of unisatMethods) {
          const original = wallet[method] as (...args: unknown[]) => unknown;
          wallet[method] = (...args: unknown[]) => {
            calls.push(`unisat.${method}`);
            return original(...args);
          };
        }

      type Request = (args: { method: string }) => Promise<unknown>;
      const wrapped = new WeakSet<object>();
      window.addEventListener("eip6963:announceProvider", (event) => {
        const provider = (
          event as CustomEvent<{ provider?: { request?: Request } }>
        ).detail?.provider;
        const original = provider?.request;
        if (!provider || !original || wrapped.has(provider)) return;
        wrapped.add(provider);
        provider.request = (args) => {
          calls.push(`ethereum.${args.method}`);
          return original.call(provider, args);
        };
      });
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    },
    [UNISAT_PROMPTING_METHODS, WALLET_PROMPT_LOG] as const,
  );

  await page.goto("/vaults", { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  await page.getByTestId("deposit-button").first().click();

  const dialog = page.locator(".portal-root");
  const amountInput = dialog.locator("input").first();
  await amountInput.fill(AMOUNT_TO_SUBMIT_BTC);
  await dialog.getByRole("button", { name: SELECT_PROVIDER_LABEL }).click();
  await dialog.locator(SELECTABLE_PROVIDER_ROW).first().click();
  const submit = dialog.locator(FLUID_CTA_SELECTOR);
  await expect(submit).toBeEnabled();
  await submit.click();
  await dialog.locator(STEP_MARKER).first().waitFor();

  // Connecting already asked the ETH provider (accounts, chain); only what
  // follows Sign is the deposit's.
  const beforeSign = await page.evaluate((logName) => {
    const calls = (window as unknown as Record<string, string[]>)[logName];
    return calls.splice(0, calls.length);
  }, WALLET_PROMPT_LOG);
  expect(
    beforeSign.some((call) => call.startsWith("ethereum.")),
    "The ETH provider wrapper must be live, or the prompt log proves nothing.",
  ).toBe(true);
  await dialog
    .getByRole("button", { name: SIGN_TRANSACTION_LABEL, exact: true })
    .click();

  await expect(
    dialog.getByText(POSITION_FULL_TITLE, { exact: true }),
  ).toBeVisible();
  // Before registration nothing is resumable: the flow ends, so the CTA
  // closes rather than offering a retry. Matched by its visible text: the
  // dialog's icon-only close button carries the same accessible name.
  await expect(
    dialog
      .getByRole("button", { name: CLOSE_LABEL, exact: true })
      .filter({ hasText: CLOSE_LABEL }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: RETRY_LABEL, exact: true }),
  ).toHaveCount(0);

  const afterSign = await page.evaluate(
    (logName) => (window as unknown as Record<string, string[]>)[logName],
    WALLET_PROMPT_LOG,
  );
  const prompts = afterSign.filter(
    (call) =>
      call.startsWith("unisat.") ||
      (ETH_PROMPTING_METHODS as readonly string[]).includes(
        call.slice("ethereum.".length),
      ),
  );
  expect(prompts).toEqual([]);

  // The flow asked the chain itself: the depositor's registered vaults
  // first, then the application, about exactly this deposit.
  const asks = backend.chain.statedAsks;
  const vaultListAsk = asks.findIndex(
    (ask) =>
      ask.target === RECORDED_DEPLOYMENT.BTC_VAULT_REGISTRY.toLowerCase(),
  );
  const capacityAsk = asks.findIndex(
    (ask) => ask.target === RECORDED_DEPLOYMENT.AAVE_ADAPTER.toLowerCase(),
  );
  expect(vaultListAsk).toBeGreaterThanOrEqual(0);
  expect(capacityAsk).toBeGreaterThan(vaultListAsk);
  expect(
    decodeFunctionData({
      abi: GET_DEPOSITOR_VAULT_IDS_ABI,
      data: asks[vaultListAsk].callData,
    }).args,
  ).toEqual([RECORDED_DEPOSITOR.ETH_ADDRESS]);
  expect(
    decodeFunctionData({
      abi: ALLOWED_TO_DEPOSIT_ABI,
      data: asks[capacityAsk].callData as Hex,
    }).args,
  ).toEqual([
    RECORDED_DEPOSITOR.ETH_ADDRESS,
    VAULTS_IN_DEPOSIT,
    AMOUNT_TO_SUBMIT_SATS,
  ]);

  assertRecordingCovered(backend, "position-capacity refusal", [
    "eth-rpc",
    "graphql",
    "vp-health",
    "mempool",
  ]);
});
