import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ACCORDION_CSS_SOURCE = readFileSync(path.resolve(__dirname, "../Accordion.css"), "utf-8");

describe("Accordion", () => {
  it("declares no animation fill mode, so no accordion element keeps a transform after its enter animation", () => {
    const values = [...ACCORDION_CSS_SOURCE.matchAll(/\banimation(?:-fill-mode)?\s*:\s*([^;]+);/g)].map(
      (match) => match[1],
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).not.toMatch(/\b(forwards|both)\b/);
    }
  });
});
