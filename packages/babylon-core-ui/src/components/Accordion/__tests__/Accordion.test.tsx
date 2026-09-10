import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Accordion } from "../Accordion";
import { AccordionDetails } from "../components/AccordionDetails";
import { AccordionSummary } from "../components/AccordionSummary";

const OPEN_PANEL_SELECTOR = '.bbn-accordion-content[data-expanded="true"]';
const OPEN_PANEL_RULE = /\.bbn-accordion-content\[data-expanded="true"\]\s*\{([^}]*)\}/;

const COMPILED_ACCORDION_CSS = readFileSync(path.resolve(__dirname, "../Accordion.css"), "utf-8").replace(
  /&-/g,
  ".bbn-accordion-",
);

describe("Accordion", () => {
  it("an open panel keeps no transform after its enter animation, so fixed-position children are not clipped", () => {
    render(
      <Accordion>
        <AccordionSummary>Vault details</AccordionSummary>
        <AccordionDetails>
          <span>tooltip host</span>
        </AccordionDetails>
      </Accordion>,
    );

    fireEvent.click(screen.getByText("Vault details"));

    const panel = screen.getByText("tooltip host").parentElement!;

    fireEvent.animationEnd(panel);

    expect(panel.matches(OPEN_PANEL_SELECTOR)).toBe(true);
    expect(panel.style.getPropertyValue("transform")).toBe("");

    const openPanelRule = COMPILED_ACCORDION_CSS.match(OPEN_PANEL_RULE);

    expect(openPanelRule).not.toBeNull();
    expect(openPanelRule?.[1]).not.toMatch(/\b(forwards|both)\b/);
  });
});
