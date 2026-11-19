/**
 * Photographs the waitlist dialog an Ethereum account not on the depositor
 * allow-list sees once connected, in both themes and at every viewport.
 *
 * The recording answers `checkAllowed` with true for the recorded depositor,
 * so no other walk opens this dialog. This one states the false answer in the
 * spec instead, on the recorded AllowListPolicy, and asserts the app asked it.
 */

import { encodeFunctionResult, toFunctionSelector } from "viem";

import { expect, test } from "../fixtures";
import {
  connectInjectedWallets,
  injectPageWallets,
} from "../fixtures/pageWallets";
import { RECORDED_DEPOSITOR } from "../fixtures/replay/contracts";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  recordedPageWallets,
  writeCaptures,
} from "./capture";
import {
  flowScreenshotFileName,
  HAS_WAITLIST_DIALOG,
  VISUAL_VIEWPORTS,
  WAITLIST_DIALOG_STOPS,
} from "./targets";

/**
 * The AllowListPolicy the recorded registry's `allowListPolicy()` answers with
 * (see the recording notes in `fixtures/replay/recording.ts`).
 */
const RECORDED_ALLOW_LIST_POLICY = "0x4ba8129906cb2e5d56eceb51e985861197e2717e";

const CHECK_ALLOWED_ABI = [
  {
    type: "function",
    name: "checkAllowed",
    stateMutability: "view",
    inputs: [
      { name: "appEntryPoint", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Test-only wallet logo, so the dialog's 32px wallet logo slot is photographed. */
const ETH_WALLET_ICON = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="16" fill="#E2761B"/>' +
    "</svg>",
).toString("base64")}`;

/** The injected wallet's EIP-6963 name (`e2e/fixtures/pageWallets.ts`), the logo's alt text. */
const ETH_WALLET_NAME = "E2E Capture Wallet";

/** `COPY.wallet.waitlist.title`, the dialog's accessible name. */
const WAITLIST_TITLE = "This wallet doesn’t have access";

test.beforeAll(ensureOutputDir);

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test.describe(`waitlist dialog ${theme} ${viewport.name}`, () => {
      test.use({
        isMobile: viewport.width < 768,
        hasTouch: viewport.width < 768,
      });
      test("capture the waitlist dialog for a wallet not on the allow-list", async ({
        page,
      }) => {
        test.skip(
          !HAS_WAITLIST_DIALOG,
          "The checked-out source has no waitlist dialog.",
        );
        await page.setViewportSize(viewport);
        const backend = await preparePage(page, {
          statedAnswers: [
            {
              target: RECORDED_ALLOW_LIST_POLICY,
              selector: toFunctionSelector(CHECK_ALLOWED_ABI[0]),
              answer: () =>
                encodeFunctionResult({
                  abi: CHECK_ALLOWED_ABI,
                  functionName: "checkAllowed",
                  result: false,
                }),
            },
          ],
        });
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await injectPageWallets(page, {
          ...recordedPageWallets(),
          ethIcon: ETH_WALLET_ICON,
        });
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await connectInjectedWallets(page);
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));

        const dialog = page.getByRole("dialog", { name: WAITLIST_TITLE });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText(RECORDED_DEPOSITOR.ETH_ADDRESS, { exact: true }),
        ).toBeVisible();
        const logo = dialog.getByRole("img", { name: ETH_WALLET_NAME });
        await expect(logo).toBeVisible();
        await expect
          .poll(() =>
            logo.evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThan(1);
        await expect(
          dialog.getByRole("button", { name: "Open application form" }),
        ).toBeDisabled();
        if (viewport.width < 768) {
          await expect(
            dialog.getByRole("button", { name: "Close" }),
          ).toBeVisible();
        }
        expect(
          backend.chain.statedAsks.some(
            (ask) => ask.target === RECORDED_ALLOW_LIST_POLICY,
          ),
        ).toBe(true);

        const shot = await capture(
          page,
          flowScreenshotFileName(WAITLIST_DIALOG_STOPS[theme], viewport),
          { fullPage: false },
        );
        await expect(dialog).toBeVisible();
        assertRecordingCovered(
          backend,
          `waitlist dialog ${theme} ${viewport.name}`,
          ["eth-rpc", "graphql", "vp-health", "mempool"],
        );
        await writeCaptures([shot]);
      });
    });
  }
}
