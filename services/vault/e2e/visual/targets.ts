/**
 * The capture manifest: which screens get photographed, at which sizes.
 *
 * Kept as data (not inline in the spec) because the CI job reports on
 * target names, and because adding a screen should be a one-line change
 * that needs no Playwright knowledge.
 *
 * Every target here must render without a connected wallet. The e2e
 * harness installs a wallet *sentinel* only (see `fixtures/test.ts`);
 * page-side provider construction is #1592, so connected-state screens
 * are not reachable yet and are deliberately absent.
 *
 * Paths are written out rather than imported from `src/routes.ts` for
 * two reasons. Importing app source pulls `tokenService` -> the network
 * config singleton into the Playwright runner, which throws before any
 * test is collected. And a literal path is the behaviour we want: if a
 * route is renamed, this manifest should report the old screen as
 * removed and the new one as added, not silently follow the rename and
 * claim nothing changed.
 */

export interface VisualViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface VisualTarget {
  /** Stable slug - it becomes the screenshot filename, so renaming one
   *  reads as "screen deleted + screen added" in the diff report. */
  readonly name: string;
  readonly path: string;
}

/** Desktop is the primary review size; mobile catches responsive-only
 *  regressions that a single width would hide. */
export const VISUAL_VIEWPORTS: readonly VisualViewport[] = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

export const VISUAL_TARGETS: readonly VisualTarget[] = [
  { name: "overview", path: "/" },
  { name: "vaults", path: "/vaults" },
  { name: "loans", path: "/loans" },
  { name: "activity", path: "/activity" },
  { name: "explore", path: "/explore" },
  { name: "liquidations", path: "/liquidations" },
];

export function screenshotFileName(
  target: VisualTarget,
  viewport: VisualViewport,
): string {
  return `${target.name}--${viewport.name}.png`;
}
