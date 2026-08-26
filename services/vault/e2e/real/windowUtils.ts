/**
 * Headed-window ergonomics via CDP `Browser.*WindowBounds` so the user can clearly watch the run:
 *  - maximizeWindow: fill the screen work area (belt-and-suspenders next to the `--start-maximized`
 *    launch flag) — used for the dapp window.
 *  - centerWindow: move a window to the screen center WITHOUT changing its size — used for the small
 *    wallet-approval popups so they're clearly visible.
 */
import type { Page } from "@playwright/test";

// CDP may report a popup with no bounds before it paints; fall back to a typical extension-popup size.
const DEFAULT_POPUP_WIDTH = 400;
const DEFAULT_POPUP_HEIGHT = 600;

export async function maximizeWindow(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
  } catch {
    // Non-fatal: the --start-maximized launch flag is the primary mechanism.
  }
}

export async function centerWindow(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
    const screen = await page.evaluate(() => ({
      w: window.screen.availWidth,
      h: window.screen.availHeight,
      // availLeft/availTop aren't in the TS lib but exist at runtime (multi-monitor offset).
      x: (window.screen as unknown as { availLeft?: number }).availLeft ?? 0,
      y: (window.screen as unknown as { availTop?: number }).availTop ?? 0,
    }));
    const width = bounds.width ?? DEFAULT_POPUP_WIDTH;
    const height = bounds.height ?? DEFAULT_POPUP_HEIGHT;
    // Popups open "normal"; setting left/top moves without resizing (keep width/height).
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        left: Math.max(screen.x, Math.round(screen.x + (screen.w - width) / 2)),
        top: Math.max(screen.y, Math.round(screen.y + (screen.h - height) / 2)),
      },
    });
  } catch {
    // Non-fatal: centering is a nicety, not required for the flow.
  }
}
