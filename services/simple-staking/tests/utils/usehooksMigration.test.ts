import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "../../src");

function* walkDir(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") {
        yield* walkDir(fullPath);
      }
    } else if (
      /\.(tsx?|jsx?|mtsx?|mjsx?)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      yield fullPath;
    }
  }
}

const FILES_USING_USE_DEBOUNCE_VALUE = [
  "ui/common/state/FinalityProviderState.tsx",
  "ui/common/state/FinalityProviderBsnState.tsx",
  "ui/baby/widgets/StakingForm/index.tsx",
  "ui/baby/widgets/StakingForm/hooks/useValidationTracker.ts",
  "ui/baby/components/FeeField/index.tsx",
  "ui/common/components/Multistaking/MultistakingForm/TimelockSection.tsx",
];

describe("usehooks-ts migration (no @uidotdev/usehooks)", () => {
  it("no source file imports @uidotdev/usehooks", () => {
    const violations: string[] = [];
    for (const filePath of walkDir(SRC_DIR)) {
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes("@uidotdev/usehooks")) {
        violations.push(path.relative(SRC_DIR, filePath));
      }
    }
    expect(violations).toEqual([]);
  });

  it("migrated debounce files use useDebounceValue from usehooks-ts", () => {
    for (const relativePath of FILES_USING_USE_DEBOUNCE_VALUE) {
      const filePath = path.join(SRC_DIR, relativePath);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain('from "usehooks-ts"');
      expect(content).toContain("useDebounceValue");
      expect(content).toMatch(/\[\s*[^\]]+\s*\]\s*=\s*useDebounceValue\(/);
    }
  });
});
