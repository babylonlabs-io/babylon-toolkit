import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import {
  ContractError,
  ErrorCode,
  tagMinedRevert,
  tagSimulationPhase,
} from "@/utils/errors";

import { appendActivationRevertNotice } from "../activationRevertNotice";

const MESSAGE = "The application is at its deposit limit.";

function capExceededError(): ContractError {
  return new ContractError(
    MESSAGE,
    ErrorCode.CONTRACT_ERROR,
    undefined,
    "ActivationCapExceeded",
  );
}

describe("appendActivationRevertNotice", () => {
  it("appends the secret notice to a mined ActivationCapExceeded revert", () => {
    const err = tagMinedRevert(capExceededError());

    expect(appendActivationRevertNotice(err, MESSAGE)).toBe(
      `${MESSAGE} ${COPY.deposit.errors.activationRevertedSecretPublic}`,
    );
  });

  it("appends the secret notice to a mined revert with no decoded reason, such as out of gas", () => {
    const err = tagMinedRevert(
      new ContractError(MESSAGE, ErrorCode.CONTRACT_ERROR),
    );

    expect(appendActivationRevertNotice(err, MESSAGE)).toBe(
      `${MESSAGE} ${COPY.deposit.errors.activationRevertedSecretPublic}`,
    );
  });

  it("appends the secret notice to a mined revert with another registry reason", () => {
    const err = tagMinedRevert(
      new ContractError(
        MESSAGE,
        ErrorCode.CONTRACT_ERROR,
        undefined,
        "ActivationDeadlineExpired",
      ),
    );

    expect(appendActivationRevertNotice(err, MESSAGE)).toBe(
      `${MESSAGE} ${COPY.deposit.errors.activationRevertedSecretPublic}`,
    );
  });

  it("leaves an untagged wallet rejection unchanged", () => {
    expect(appendActivationRevertNotice(capExceededError(), MESSAGE)).toBe(
      MESSAGE,
    );
  });

  it("leaves a simulation-phase ActivationCapExceeded message unchanged", () => {
    const err = tagSimulationPhase(capExceededError());

    expect(appendActivationRevertNotice(err, MESSAGE)).toBe(MESSAGE);
  });

  it("leaves a plain Error unchanged", () => {
    expect(appendActivationRevertNotice(new Error(MESSAGE), MESSAGE)).toBe(
      MESSAGE,
    );
  });
});
