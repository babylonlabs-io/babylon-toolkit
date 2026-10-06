import { VAULT_ERROR_ABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import { describe, expect, it } from "vitest";

import { CONTRACT_ERROR_MESSAGES } from "../errorMessages";

describe("CONTRACT_ERROR_MESSAGES", () => {
  it("only has copy for errors some vault contract revision declares", () => {
    const declared = new Set(
      VAULT_ERROR_ABI.flatMap((item) =>
        item.type === "error" ? [item.name] : [],
      ),
    );
    const undeclared = Object.keys(CONTRACT_ERROR_MESSAGES).filter(
      (name) => !declared.has(name),
    );

    expect(undeclared).toEqual([]);
  });
});
