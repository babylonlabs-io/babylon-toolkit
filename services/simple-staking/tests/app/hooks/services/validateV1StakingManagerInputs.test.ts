import type {
  BabylonBtcStakingManager,
  VersionedStakingParams,
} from "@babylonlabs-io/btc-staking-ts";

import { ClientError } from "@/ui/common/errors";
import type { BtcStakingInputs } from "@/ui/common/types/stakingInputs";
import { validateV1StakingManagerInputs } from "@/ui/common/utils/validateV1StakingManagerInputs";
import { validateStakingInput } from "@/ui/common/utils/delegations";

jest.mock("@/ui/common/utils/delegations", () => ({
  validateStakingInput: jest.fn(),
}));

const mockedValidateStakingInput =
  validateStakingInput as jest.MockedFunction<typeof validateStakingInput>;

const createMockManager = () => ({} as BabylonBtcStakingManager);

describe("validateV1StakingManagerInputs", () => {
  const mockStakingInput: BtcStakingInputs = {
    finalityProviderPksNoCoordHex: ["mock-provider-pk"],
    stakingAmountSat: 100000,
    stakingTimelock: 1000,
  };

  const mockStakerBtcInfo = {
    address: "mock-btc-address",
    publicKeyNoCoordHex: "mock-staker-pk",
  };

  type StakerBtcInfo = typeof mockStakerBtcInfo;

  const mockVersionedParams: VersionedStakingParams[] = [
    {} as VersionedStakingParams,
  ];

  let mockBtcStakingManager: BabylonBtcStakingManager;
  let mockLogger: { warn: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedValidateStakingInput.mockImplementation(() => undefined);
    mockBtcStakingManager = createMockManager();
    mockLogger = { warn: jest.fn() };
  });

  it("calls validateStakingInput with the provided staking input", () => {
    validateV1StakingManagerInputs(
      mockBtcStakingManager,
      mockStakingInput,
      mockStakerBtcInfo,
      mockVersionedParams,
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
      validateV1StakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        mockStakerBtcInfo,
        mockVersionedParams,
      ),
    ).toThrow(stakingError);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("throws when btcStakingManager is %s", (_, invalidManager) => {
    const act = () =>
      validateV1StakingManagerInputs(
        invalidManager as unknown as BabylonBtcStakingManager,
        mockStakingInput,
        mockStakerBtcInfo,
        mockVersionedParams,
      );

    expect(act).toThrow(ClientError);
    expect(act).toThrow("BTC Staking Manager not initialized");
  });

  it("logs warning when btcStakingManager is null and logger provided", () => {
    expect(() =>
      validateV1StakingManagerInputs(
        null,
        mockStakingInput,
        mockStakerBtcInfo,
        mockVersionedParams,
        mockLogger,
      ),
    ).toThrow(ClientError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "BTC Staking Manager not initialized",
    );
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    [
      "empty address",
      { ...mockStakerBtcInfo, address: "" } as unknown as StakerBtcInfo,
    ],
    [
      "missing address",
      { ...mockStakerBtcInfo, address: undefined } as unknown as StakerBtcInfo,
    ],
    [
      "empty public key",
      {
        ...mockStakerBtcInfo,
        publicKeyNoCoordHex: "",
      } as unknown as StakerBtcInfo,
    ],
    [
      "missing public key",
      {
        ...mockStakerBtcInfo,
        publicKeyNoCoordHex: undefined,
      } as unknown as StakerBtcInfo,
    ],
  ])("throws when staker BTC info is %s", (_, invalidStakerInfo) => {
    const act = () =>
      validateV1StakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        invalidStakerInfo as StakerBtcInfo,
        mockVersionedParams,
      );

    expect(act).toThrow(ClientError);
    expect(act).toThrow("Staker info not initialized");
  });

  it("logs warning when staker info is invalid and logger provided", () => {
    const invalidStakerInfo = {
      ...mockStakerBtcInfo,
      address: undefined,
    } as unknown as StakerBtcInfo;

    expect(() =>
      validateV1StakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        invalidStakerInfo,
        mockVersionedParams,
        mockLogger,
      ),
    ).toThrow(ClientError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith("Staker info not initialized");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty array", []],
  ])(
    "throws when versionedParams is %s",
    (_, invalidParams: VersionedStakingParams[] | undefined | null) => {
      const act = () =>
        validateV1StakingManagerInputs(
          mockBtcStakingManager,
          mockStakingInput,
          mockStakerBtcInfo,
          invalidParams as VersionedStakingParams[] | undefined,
        );

      expect(act).toThrow(ClientError);
      expect(act).toThrow("Staking params not loaded");
    },
  );

  it("logs warning when versionedParams is empty and logger provided", () => {
    expect(() =>
      validateV1StakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        mockStakerBtcInfo,
        [],
        mockLogger,
      ),
    ).toThrow(ClientError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith("Staking params not loaded");
  });

  it("does not throw with all valid inputs", () => {
    expect(() =>
      validateV1StakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        mockStakerBtcInfo,
        mockVersionedParams,
      ),
    ).not.toThrow();
  });

  it("does not throw with all valid inputs and logger", () => {
    expect(() =>
      validateV1StakingManagerInputs(
        mockBtcStakingManager,
        mockStakingInput,
        mockStakerBtcInfo,
        mockVersionedParams,
        mockLogger,
      ),
    ).not.toThrow();

    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
