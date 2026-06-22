import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const SRI_HASH_PREFIX = "sha384-";

function computeSriHash(content: Buffer): string {
  return `${SRI_HASH_PREFIX}${createHash("sha384").update(content).digest("base64")}`;
}

function stripCrossorigin(attrs: string): string {
  return attrs.replace(/\s*crossorigin(?:="[^"]*")?/g, "");
}

/**
 * Adds Subresource Integrity (`integrity` + `crossorigin`) attributes to every
 * local script/module-preload in the built `index.html`, and fails the build if
 * any local JS script is left unprotected.
 *
 * Hashes are computed from the bytes Vite actually writes to disk. The in-memory
 * `chunk.code` exposed during `generateBundle` does not match the final entry
 * chunk, whose sibling-chunk import references are rewritten afterwards — a stale
 * hash there makes the browser reject the entry script and blank the app.
 */
export function sriPlugin(): Plugin {
  let outDir = "";
  function resolveIntegrity(urlPath: string): string | undefined {
    if (!outDir) return undefined;
    const fileName = urlPath.replace(/^\//, "");
    try {
      return computeSriHash(readFileSync(resolve(outDir, fileName)));
    } catch {
      return undefined;
    }
  }
  return {
    name: "sri",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!outDir) return;
      const htmlPath = resolve(outDir, "index.html");
      let html: string;
      try {
        html = readFileSync(htmlPath, "utf8");
      } catch {
        return;
      }
      const patched = html
        .replace(
          /<script ([^>]*?)src="([^"]+)"([^>]*?)>/g,
          (match, before, src, after) => {
            const integrity = resolveIntegrity(src);
            if (!integrity) return match;
            return `<script ${stripCrossorigin(before)}src="${src}" integrity="${integrity}" crossorigin="anonymous"${stripCrossorigin(after)}>`;
          },
        )
        .replace(
          /<link ([^>]*?)href="([^"]+\.js)"([^>]*?)>/g,
          (match, before, href, after) => {
            const integrity = resolveIntegrity(href);
            if (!integrity) return match;
            return `<link ${stripCrossorigin(before)}href="${href}" integrity="${integrity}" crossorigin="anonymous"${stripCrossorigin(after)}>`;
          },
        );

      const unprotected = [
        ...patched.matchAll(/<script [^>]*?src="(\/[^"]+\.js)"[^>]*>/g),
      ].filter((m) => !m[0].includes(`integrity="${SRI_HASH_PREFIX}`));
      if (unprotected.length > 0) {
        throw new Error(
          `SRI plugin: ${unprotected.length} local JS script(s) missing integrity attribute: ${unprotected.map((m) => m[1]).join(", ")}`,
        );
      }

      writeFileSync(htmlPath, patched);
    },
  };
}
