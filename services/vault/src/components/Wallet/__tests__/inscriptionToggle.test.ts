import { describe, expect, it } from "vitest";

import { shouldShowInscriptionsToggle } from "../inscriptionToggle";

describe("shouldShowInscriptionsToggle", () => {
  it("shows the toggle when the wallet holds inscriptions and they are excluded", () => {
    expect(shouldShowInscriptionsToggle(2, true)).toBe(true);
  });

  it("shows the toggle when the wallet holds inscriptions and they are included", () => {
    expect(shouldShowInscriptionsToggle(2, false)).toBe(true);
  });

  it("hides the toggle for the default user with no detected inscriptions", () => {
    expect(shouldShowInscriptionsToggle(0, true)).toBe(false);
  });

  it("keeps the toggle visible when the user opted in but none are detected", () => {
    expect(shouldShowInscriptionsToggle(0, false)).toBe(true);
  });
});
