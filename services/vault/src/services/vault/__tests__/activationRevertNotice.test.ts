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

function deadlineExpiredError(): ContractError {
  return new ContractError(
    MESSAGE,
    ErrorCode.CONTRACT_ERROR,
    undefined,
    "ActivationDeadlineExpired",
  );
}

describe("appendActivationRevertNotice", () => {
  it("appends the activation secret notice to a mined ActivationCapExceeded revert", () => {
    const err = tagMinedRevert(capExceededError());

    expect(appendActivationRevertNotice(err, MESSAGE, "activate")).toBe(
      `${MESSAGE} ${COPY.deposit.errors.activationRevertedSecretPublic}`,
    );
  });

  it("appends the activation secret notice to a mined revert with no decoded reason, such as out of gas", () => {
    const err = tagMinedRevert(
      new ContractError(MESSAGE, ErrorCode.CONTRACT_ERROR),
    );

    expect(appendActivationRevertNotice(err, MESSAGE, "activate")).toBe(
      `${MESSAGE} ${COPY.deposit.errors.activationRevertedSecretPublic}`,
    );
  });

  it("appends the retry-only notice to a mined activation revert Withdraw would also hit", () => {
    const err = tagMinedRevert(
      new ContractError(
        MESSAGE,
        ErrorCode.CONTRACT_ERROR,
        undefined,
        "InvalidBTCVaultStatus",
      ),
    );

    expect(appendActivationRevertNotice(err, MESSAGE, "activate")).toBe(
      `${MESSAGE} ${COPY.deposit.errors.activationRevertedSecretPublicRetryOnly}`,
    );
  });

  it("appends the Withdraw secret notice to a mined Withdraw revert", () => {
    const err = tagMinedRevert(
      new ContractError(MESSAGE, ErrorCode.CONTRACT_ERROR),
    );

    expect(appendActivationRevertNotice(err, MESSAGE, "withdraw")).toBe(
      `${MESSAGE} ${COPY.deposit.errors.withdrawRevertedSecretPublic}`,
    );
  });

  it("appends the deadline secret notice to a mined ActivationDeadlineExpired activation revert", () => {
    const err = tagMinedRevert(deadlineExpiredError());

    expect(appendActivationRevertNotice(err, MESSAGE, "activate")).toBe(
      `${MESSAGE} ${COPY.deposit.errors.deadlineRevertedSecretPublic}`,
    );
  });

  it("appends the deadline secret notice to a mined ActivationDeadlineExpired Withdraw revert", () => {
    const err = tagMinedRevert(deadlineExpiredError());

    expect(appendActivationRevertNotice(err, MESSAGE, "withdraw")).toBe(
      `${MESSAGE} ${COPY.deposit.errors.deadlineRevertedSecretPublic}`,
    );
  });

  it("leaves a simulated ActivationDeadlineExpired refusal unchanged", () => {
    const err = tagSimulationPhase(deadlineExpiredError());

    expect(appendActivationRevertNotice(err, MESSAGE, "withdraw")).toBe(
      MESSAGE,
    );
  });

  it("leaves an untagged wallet rejection unchanged", () => {
    expect(
      appendActivationRevertNotice(capExceededError(), MESSAGE, "activate"),
    ).toBe(MESSAGE);
  });

  it("leaves a simulation-phase ActivationCapExceeded message unchanged", () => {
    const err = tagSimulationPhase(capExceededError());

    expect(appendActivationRevertNotice(err, MESSAGE, "activate")).toBe(
      MESSAGE,
    );
  });

  it("leaves a plain Error unchanged", () => {
    expect(
      appendActivationRevertNotice(new Error(MESSAGE), MESSAGE, "withdraw"),
    ).toBe(MESSAGE);
  });
});
