import type { BabylonBtcStakingManager } from "@babylonlabs-io/btc-staking-ts";

import { ClientError } from "@/ui/common/errors";
import type { BtcStakingInputs } from "@/ui/common/types/stakingInputs";
import { validateStakingManagerInputs } from "@/ui/common/utils/validateStakingManagerInputs";
import { validateStakingInput } from "@/ui/common/utils/delegations";

jest.mock("@/ui/common/utils/delegations", () => ({
  validateStakingInput: jest.fn(),
}));

const mockedValidateStakingInput =
  validateStakingInput as jest.MockedFunction<typeof validateStakingInput>;

const createMockManager = () => ({} as BabylonBtcStakingManager);

describe("validateStakingManagerInputs", () => {
  const mockStakingInput: BtcStakingInputs = {
    finalityProviderPksNoCoordHex: ["mock-provider-pk"],
    stakingAmountSat: 100000,
    stakingTimelock: 1000,
  };

  const mockStakerInfo = {
    address: "mock-btc-address",
    publicKeyNoCoordHex: "mock-staker-pk",
  };

  type StakerInfo = typeof mockStakerInfo;

  const mockTipHeight = 800000;

  let mockBtcStakingManager: BabylonBtcStakingManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedValidateStakingInput.mockImplementation(() => undefined);
    mockBtcStakingManager = createMockManager();
  });

  it("calls validateStakingInput with the provided staking input", () => {
    validateStakingManagerInputs(
      mockBtcStakingManager,
      mockStakingInput,
      mockTipHeight,
      mockStakerInfo,
    );

    expect(mockedValidateStakingInput).toHaveBeenCalledTimes(1);
    expect(mockedValidateStakingInput).toHaveBeenCalledWith(mockStakingInput);
  });

  it("propagates errors thrown by validateStakingInput", () => {
    const stakingError = new Error("invalid staking input");
    mockedValidateStakingInput.mockImplementationOnce(() => {
      throw stakingError;
    });

    expect(() =>
      validateStakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        mockTipHeight,
        mockStakerInfo,
      ),
    ).toThrow(stakingError);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
  ])("throws when tip height is %s", (_, invalidTipHeight) => {
    const act = () =>
      validateStakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        invalidTipHeight as number,
        mockStakerInfo,
      );

    expect(act).toThrow(ClientError);
    expect(act).toThrow("Tip height not initialized");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    [
      "empty address",
      { ...mockStakerInfo, address: "" } as unknown as StakerInfo,
    ],
    [
      "missing address",
      { ...mockStakerInfo, address: undefined } as unknown as StakerInfo,
    ],
    [
      "empty public key",
      { ...mockStakerInfo, publicKeyNoCoordHex: "" } as unknown as StakerInfo,
    ],
    [
      "missing public key",
      {
        ...mockStakerInfo,
        publicKeyNoCoordHex: undefined,
      } as unknown as StakerInfo,
    ],
  ])("throws when staker info is %s", (_, invalidStakerInfo) => {
    const act = () =>
      validateStakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        mockTipHeight,
        invalidStakerInfo as StakerInfo,
      );

    expect(act).toThrow(ClientError);
    expect(act).toThrow("Staker info not initialized");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("throws when btcStakingManager is %s", (_, invalidManager) => {
    const act = () =>
      validateStakingManagerInputs(
        invalidManager as unknown as BabylonBtcStakingManager,
        mockStakingInput,
        mockTipHeight,
        mockStakerInfo,
      );

    expect(act).toThrow(ClientError);
    expect(act).toThrow("BTC Staking Manager not initialized");
  });

  it("returns the btcStakingManager and tip height when validation passes", () => {
    const result = validateStakingManagerInputs(
      mockBtcStakingManager,
      mockStakingInput,
      mockTipHeight,
      mockStakerInfo,
    );

    expect(result).toEqual({
      btcStakingManager: mockBtcStakingManager,
      tipHeight: mockTipHeight,
    });
  });
});
