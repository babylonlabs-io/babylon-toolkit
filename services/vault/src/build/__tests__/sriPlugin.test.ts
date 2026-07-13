// @vitest-environment node
// Vite's build pipeline (esbuild) cannot run under jsdom — it swaps the global
// Uint8Array/TextEncoder and breaks esbuild's realm check.
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { sriPlugin } from "../sriPlugin";

function sha384(content: Buffer): string {
  return `sha384-${createHash("sha384").update(content).digest("base64")}`;
}

// Rewrites the entry chunk in a `generateBundle` hook — i.e. AFTER any earlier
// hook would have seen the chunk's code. This reproduces the real failure class
// that broke the app: the bytes Vite finally writes to disk differ from the
// in-memory `chunk.code` an earlier hook hashed, leaving a stale integrity hash.
function rewriteEntryChunkPlugin(): Plugin {
  return {
    name: "rewrite-entry-chunk",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          chunk.code += "\n/* rewritten after hashing */\n";
        }
      }
    },
  };
}

describe("sriPlugin", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  // Builds a tiny fixture app with the SRI plugin into a temp dir and returns
  // the output dir. The entry statically imports a sibling forced into its own
  // chunk, so the built HTML carries a script, a module entry, and a preload.
  async function buildFixture(
    indexHtml: string,
    extraPlugins: Plugin[] = [],
  ): Promise<string> {
    // realpath: macOS tmpdir is a /var -> /private/var symlink, and a root that
    // mismatches the resolved HTML path makes Vite emit an invalid output name.
    root = realpathSync(mkdtempSync(join(tmpdir(), "sri-test-")));
    mkdirSync(join(root, "public"));
    writeFileSync(
      join(root, "public", "process-polyfill.js"),
      "window.process = window.process || {};\n",
    );
    writeFileSync(join(root, "sibling.ts"), "export const answer = 42;\n");
    writeFileSync(
      join(root, "main.ts"),
      'import { answer } from "./sibling";\ndocument.title = String(answer);\n',
    );
    writeFileSync(join(root, "index.html"), indexHtml);

    const outDir = join(root, "dist");
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [sriPlugin(), ...extraPlugins],
      build: {
        outDir,
        sourcemap: true,
        rollupOptions: {
          output: {
            manualChunks: (id: string) =>
              id.includes("sibling") ? "sibling" : undefined,
          },
        },
      },
    });
    return outDir;
  }

  const VALID_HTML = `<!doctype html>
<html>
  <head>
    <script src="/process-polyfill.js"></script>
  </head>
  <body>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
`;

  it("injects integrity matching the bytes on disk, even when a later build hook rewrites the entry chunk", async () => {
    const outDir = await buildFixture(VALID_HTML, [rewriteEntryChunkPlugin()]);
    const html = readFileSync(join(outDir, "index.html"), "utf8");

    const refs = [
      ...html.matchAll(
        /(?:src|href)="(\/[^"]+\.js)"\s+integrity="(sha384-[A-Za-z0-9+/=]+)"/g,
      ),
    ];

    // At minimum the public polyfill and the hashed entry chunk are protected.
    expect(refs.length).toBeGreaterThanOrEqual(2);
    // The hashed entry module must carry an integrity attribute — the asset that
    // broke when hashing in-memory chunk code instead of the final disk bytes.
    expect(html).toMatch(
      /<script type="module" src="\/assets\/[^"]+\.js" integrity="sha384-/,
    );

    for (const [, path, injected] of refs) {
      const actual = sha384(readFileSync(join(outDir, path.slice(1))));
      expect(actual, `integrity mismatch for ${path}`).toBe(injected);
    }
  });

  it("throws during build when a local script cannot be given an integrity hash", async () => {
    const htmlWithUnresolvableScript = `<!doctype html>
<html>
  <head>
    <script src="/missing.js"></script>
  </head>
  <body>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
`;

    await expect(buildFixture(htmlWithUnresolvableScript)).rejects.toThrow(
      /missing integrity attribute/,
    );
  });
});
