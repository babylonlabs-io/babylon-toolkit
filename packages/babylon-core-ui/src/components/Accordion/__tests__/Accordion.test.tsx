import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ACCORDION_CSS = readFileSync(
  path.resolve(__dirname, "../Accordion.css"),
  "utf-8",
);

describe("Accordion.css motion", () => {
  it("does not hold a transform on the open panel after the enter animation ends", () => {
    const openPanelRule = ACCORDION_CSS.match(
      /&-content\[data-expanded="true"\]\s*{([^}]*)}/,
    );
    expect(openPanelRule).not.toBeNull();

    const [, declarations] = openPanelRule!;

    expect(declarations).not.toMatch(/\b(forwards|both)\b/);
    expect(declarations).not.toMatch(/animation-fill-mode/);
  });
});
