import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import { classifyActivationFailure } from "../activationFailureKind";
import {
  ACTIVATION_CHECK_UNSUPPORTED_REASON,
  tagMinedRevert,
  tagSimulationPhase,
} from "../contract";
import { DepositorWalletMismatchError } from "../depositorWalletMismatch";
import { SendOutcomeUnknownError } from "../transactionOutcome";
import {
  ActivationNotPossibleError,
  ActivationPausedError,
  ActivationWouldRedeemError,
  ContractError,
  ErrorCode,
} from "../types";

function revert(reason: string | undefined): ContractError {
  return new ContractError(
    "reverted",
    ErrorCode.CONTRACT_REVERT,
    undefined,
    reason,
  );
}

describe("classifyActivationFailure", () => {
  it("classifies a mined revert before the deadline as mined-revert", () => {
    expect(
      classifyActivationFailure(
        tagMinedRevert(revert("ActivationCapExceeded")),
      ),
    ).toBe("mined-revert");
  });

  it("classifies a mined revert with no decoded reason as mined-revert", () => {
    expect(classifyActivationFailure(tagMinedRevert(revert(undefined)))).toBe(
      "mined-revert",
    );
  });

  it.each([
    "TBV_Paused",
    "Unauthorized",
    "InvalidBTCVaultStatus",
    "PrePeginOutputAlreadyUsed",
  ])("classifies a mined %s, which Withdraw also hits, as other", (reason) => {
    expect(classifyActivationFailure(tagMinedRevert(revert(reason)))).toBe(
      "other",
    );
  });

  // Unlike the pre-send delay refusal: once mined the secret is public, and
  // Withdraw is the exit that works before the delay ends.
  it("classifies a mined ActivationDelayNotElapsed as mined-revert, offering Withdraw because the contract exempts the redeem from the delay", () => {
    expect(
      classifyActivationFailure(
        tagMinedRevert(revert("ActivationDelayNotElapsed")),
      ),
    ).toBe("mined-revert");
  });

  it("classifies a mined ActivationDeadlineExpired revert as mined-deadline-expired", () => {
    expect(
      classifyActivationFailure(
        tagMinedRevert(revert("ActivationDeadlineExpired")),
      ),
    ).toBe("mined-deadline-expired");
  });

  it("classifies a simulated ActivationCapExceeded as pre-send-refusal", () => {
    expect(
      classifyActivationFailure(
        tagSimulationPhase(revert("ActivationCapExceeded")),
      ),
    ).toBe("pre-send-refusal");
  });

  it("classifies a simulated ApplicationNotActive as pre-send-refusal", () => {
    expect(
      classifyActivationFailure(
        tagSimulationPhase(revert("ApplicationNotActive")),
      ),
    ).toBe("pre-send-refusal");
  });

  it("classifies a simulated position-limit refusal as pre-send-refusal", () => {
    expect(
      classifyActivationFailure(
        tagSimulationPhase(revert("PositionSizesRejectedByApplication")),
      ),
    ).toBe("pre-send-refusal");
  });

  it("classifies the gas check's would-redeem refusal as pre-send-refusal", () => {
    expect(
      classifyActivationFailure(new ActivationWouldRedeemError("would redeem")),
    ).toBe("pre-send-refusal");
  });

  it("classifies an Aave-scope pause as aave-paused", () => {
    expect(
      classifyActivationFailure(new ActivationPausedError("paused", "aave")),
    ).toBe("aave-paused");
  });

  it("classifies a protocol-scope pause as other", () => {
    expect(
      classifyActivationFailure(
        new ActivationPausedError("paused", "protocol"),
      ),
    ).toBe("other");
  });

  it.each([
    "InvalidSecret",
    "ActivationDeadlineExpired",
    "InvalidBTCVaultStatus",
    "ActivationDelayNotElapsed",
    "TBV_Paused",
    "Unauthorized",
  ])(
    "classifies a simulated %s, which Withdraw also hits, as other",
    (reason) => {
      expect(
        classifyActivationFailure(tagSimulationPhase(revert(reason))),
      ).toBe("other");
    },
  );

  it("classifies an unsupported activation check as other", () => {
    expect(
      classifyActivationFailure(
        tagSimulationPhase(revert(ACTIVATION_CHECK_UNSUPPORTED_REASON)),
      ),
    ).toBe("other");
  });

  it("classifies a simulated revert whose reason is not a vault-contract error as other", () => {
    expect(
      classifyActivationFailure(
        tagSimulationPhase(revert("execution reverted")),
      ),
    ).toBe("other");
  });

  it("classifies a vault-contract reason outside the simulation phase as other", () => {
    expect(classifyActivationFailure(revert("ActivationCapExceeded"))).toBe(
      "other",
    );
  });

  it("classifies a simulated vault-contract reason that is not a revert as other", () => {
    expect(
      classifyActivationFailure(
        tagSimulationPhase(
          new ContractError(
            "rejected",
            ErrorCode.WALLET_REJECTED,
            undefined,
            "ActivationCapExceeded",
          ),
        ),
      ),
    ).toBe("other");
  });

  it("classifies a wallet rejection as other", () => {
    expect(
      classifyActivationFailure(
        new ContractError("User rejected", ErrorCode.WALLET_REJECTED),
      ),
    ).toBe("other");
  });

  it("classifies an unknown send outcome as other", () => {
    expect(
      classifyActivationFailure(new SendOutcomeUnknownError(new Error("lost"))),
    ).toBe("other");
  });

  it("classifies a wrong depositor wallet as other", () => {
    expect(
      classifyActivationFailure(
        new DepositorWalletMismatchError({
          vaultId: ("0x" + "aa".repeat(32)) as Hex,
          expectedDepositor: ("0x" + "11".repeat(20)) as Address,
          connectedDepositor: ("0x" + "22".repeat(20)) as Address,
        }),
      ),
    ).toBe("other");
  });

  it("classifies a deadline-margin refusal as other", () => {
    expect(
      classifyActivationFailure(new ActivationNotPossibleError("too late")),
    ).toBe("other");
  });

  it("classifies a plain error, such as a disconnected wallet, as other", () => {
    expect(
      classifyActivationFailure(new Error("ETH wallet is not connected")),
    ).toBe("other");
  });
});
