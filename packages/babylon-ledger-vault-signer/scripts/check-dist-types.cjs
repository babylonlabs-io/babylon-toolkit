// Post-build gate for the published types: dist/index.d.ts must exist (a
// broken beforeWriteFile filter in vite.config.ts once dropped every
// declaration), and no emitted declaration may import from a vendor path —
// vendor d.ts is excluded from dist, so such a reference would 404 for
// consumers.
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const DIST = join(__dirname, "..", "dist");

if (!existsSync(join(DIST, "index.d.ts"))) {
  console.error(
    "Build emitted no dist/index.d.ts, so the published types entry would 404. " +
      "Check the beforeWriteFile filter in vite.config.ts.",
  );
  process.exit(1);
}

// `from "…vendor/…"` (static import/re-export) or `import("…vendor/…")` (type import).
const VENDOR_REF = /(?:from\s+["'][^"']*vendor\/|import\(\s*["'][^"']*vendor\/)/;
const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".d.ts") && VENDOR_REF.test(readFileSync(path, "utf8"))) offenders.push(path);
  }
};
walk(DIST);

if (offenders.length > 0) {
  console.error(
    "Emitted declarations reference vendor paths (vendor d.ts is not shipped, so these imports would 404):\n" +
      offenders.join("\n"),
  );
  process.exit(1);
}
