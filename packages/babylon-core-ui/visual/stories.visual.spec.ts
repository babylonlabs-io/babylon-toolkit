/**
 * Photographs every Storybook story.
 *
 * The story list is read from the built Storybook's `index.json` at run
 * time rather than hard-coded, so adding a story automatically adds
 * visual coverage and deleting one shows up in the diff report as a
 * removed screen. Nothing to maintain by hand.
 *
 * Docs entries (`type: "docs"`) are skipped: an MDX page is prose about
 * the components, and it re-renders every story inside it, so capturing
 * it would double the cost and report one change as many.
 *
 * Like the vault capture, this asserts nothing about how a story looks.
 * The judgement happens in the diff step against the same capture taken
 * at the PR's merge-base.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STORYBOOK_STATIC_DIR } from "../playwright.visual.config";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const OUTPUT_DIR =
  process.env.VISUAL_OUT_DIR ?? path.join(currentDir, "__captures__");

/** Height the story frame is rendered at before it is measured. Stories
 *  are captured full-page, so this only sets the initial layout width /
 *  minimum height, not the final image height. */
const STORY_VIEWPORT = { width: 900, height: 600 };

/** Upper bound on waiting for a story's root to paint. */
const STORY_RENDER_TIMEOUT_MS = 20_000;

/** Gap between rendered-frame samples when waiting for a story to settle. */
const FRAME_SETTLE_QUIET_MS = 150;
/** Consecutive identical frames required. */
const FRAME_SETTLE_CONSECUTIVE_MATCHES = 2;
/** Upper bound on waiting for the frame to stop changing. */
const FRAME_SETTLE_TIMEOUT_MS = 15_000;

/**
 * Storybook keeps the functional loader spinning under reduced motion
 * (see docs/motion-system.md). Frozen here for the same reason the vault
 * capture freezes it: otherwise every spinner story lands on a random
 * rotation and diffs against itself forever.
 */
const FREEZE_SPINNER_CSS = `
  .bbn-loader,
  .bbn-loader * {
    animation: none !important;
  }
`;

interface StorybookIndexEntry {
  id: string;
  type?: string;
  name?: string;
  title?: string;
}

async function readStoryIds(): Promise<string[]> {
  const indexPath = path.join(STORYBOOK_STATIC_DIR, "index.json");
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch {
    throw new Error(
      `No built Storybook at ${indexPath}. Run "pnpm --filter @babylonlabs-io/core-ui run build-storybook" first.`,
    );
  }
  const index = JSON.parse(raw) as {
    entries?: Record<string, StorybookIndexEntry>;
  };
  const entries = Object.values(index.entries ?? {});
  const stories = entries
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id)
    // Sorted so the capture order - and therefore any partial output on
    // a failed run - is reproducible.
    .sort();

  if (stories.length === 0) {
    throw new Error(
      `Built Storybook at ${indexPath} contains no stories. The build likely failed silently.`,
    );
  }
  return stories;
}

/**
 * Block until the rendered frame stops changing.
 *
 * Compares the actual rendered bytes rather than a cheaper proxy. Two
 * cheaper proxies were tried and both let real flake through:
 *
 * - Scroll dimensions alone fixed the visx chart stories (`SeizureMap`
 *   remeasures its parent and re-renders at a new height) but not the
 *   overlays: a modal fading in over a fixed-position backdrop does not
 *   change the page's scroll size at all, so six modal/dialog stories
 *   kept flaking - and a *different* six each run.
 * - `sb-show-main` fires when Storybook has rendered the story, which is
 *   before its enter animation has finished.
 *
 * Polling pixels covers layout, animation, late images and lazy content
 * in one check, and costs one extra screenshot for the ~98% of stories
 * that are already settled on the first comparison.
 */
async function waitForFrameSettled(page: Page): Promise<void> {
  const deadline = Date.now() + FRAME_SETTLE_TIMEOUT_MS;
  let previous = await page.screenshot({ fullPage: true });
  let matches = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(FRAME_SETTLE_QUIET_MS);
    const current = await page.screenshot({ fullPage: true });
    if (current.equals(previous)) {
      matches += 1;
      if (matches >= FRAME_SETTLE_CONSECUTIVE_MATCHES) return;
    } else {
      matches = 0;
    }
    previous = current;
  }

  throw new Error(
    `Story never reached a stable frame within ${FRAME_SETTLE_TIMEOUT_MS}ms - something ` +
      `animates or refetches indefinitely. Freeze it here rather than accepting a flaky baseline.`,
  );
}

const storyIds = await readStoryIds();

test.beforeAll(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
});

for (const storyId of storyIds) {
  test(`capture story ${storyId}`, async ({ page }) => {
    await page.setViewportSize(STORY_VIEWPORT);

    // `viewMode=story` renders the bare component without the Storybook
    // chrome (sidebar, toolbar, addon panel), so the screenshot is the
    // component and nothing else.
    await page.goto(`/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`, {
      waitUntil: "domcontentloaded",
    });

    // Gate on Storybook's OWN render signal rather than on the DOM having
    // content. `sb-show-main` means "the story finished rendering",
    // which is the question we actually care about.
    //
    // Two DOM-based gates were tried first and both were wrong. Checking
    // `#storybook-root` has children fails on modal/dialog/tooltip
    // stories, which portal onto `document.body` and leave the root
    // permanently empty. Checking for *any* painted element then fails on
    // stories that intentionally render nothing (TopBanner's `Hidden`).
    // `sb-show-main` is correct for all three.
    // Waits for ANY terminal mode, not just the successful one. Storybook's
    // `showMode` removes every other mode class as it adds one, so a story
    // that throws never gets `sb-show-main` — gating on that alone made this
    // time out after the full 20s and left the error check below unreachable,
    // turning an actionable message into an opaque timeout.
    await page.waitForFunction(
      () => {
        const { classList } = document.body;
        return (
          classList.contains("sb-show-main") ||
          classList.contains("sb-show-errordisplay") ||
          classList.contains("sb-show-nopreview")
        );
      },
      undefined,
      { timeout: STORY_RENDER_TIMEOUT_MS },
    );

    // A story that threw renders Storybook's error panel instead. That is
    // stable, so it would happily become a baseline and the broken story
    // would never be noticed again. Fail loudly instead.
    const failureClass = await page.evaluate(() => {
      const { classList } = document.body;
      if (classList.contains("sb-show-errordisplay")) return "errordisplay";
      if (classList.contains("sb-show-nopreview")) return "nopreview";
      return null;
    });
    if (failureClass !== null) {
      throw new Error(
        `Story "${storyId}" rendered Storybook's ${failureClass} panel instead of the component. ` +
          `Fix the story - capturing it would bake the error screen in as the expected look.`,
      );
    }

    await page.addStyleTag({ content: FREEZE_SPINNER_CSS });
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Wait for every <img> to be decoded, not merely loaded. Token and
      // provider icons otherwise land decoded on one run and blank on the
      // next, which showed up as a small but permanent diff on the icon
      // area of four stories. `decode()` rejects for a broken image; that
      // is the story's problem, not the capture's, so it is swallowed.
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.decode().catch(() => undefined),
        ),
      );
    });
    await waitForFrameSettled(page);

    const buffer = await page.screenshot({ fullPage: true });
    await fs.writeFile(path.join(OUTPUT_DIR, `${storyId}.png`), buffer);

    expect(buffer.byteLength).toBeGreaterThan(100);
  });
}
