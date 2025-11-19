import { createRef } from "react";
import type { MutableRefObject } from "react";

import { isRef } from "@/ui/common/utils/isRef";

describe("isRef", () => {
  it("returns true for refs created via createRef", () => {
    const ref = createRef<number>();
    expect(isRef(ref)).toBe(true);
  });

  it("returns true for mutable ref object literals", () => {
    const ref: MutableRefObject<string> = { current: "value" };
    expect(isRef(ref)).toBe(true);
  });

  it("returns false for plain objects without current", () => {
    expect(isRef({ foo: "bar" })).toBe(false);
  });

  it("returns false for null or primitives", () => {
    expect(isRef(null)).toBe(false);
    expect(isRef(42)).toBe(false);
    expect(isRef("ref")).toBe(false);
  });
});
