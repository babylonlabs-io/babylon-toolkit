import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Heading,
  Loader,
  Text,
} from "@babylonlabs-io/core-ui";

import { FinalityProviderLogo } from "@/ui/common/components/Staking/FinalityProviders/FinalityProviderLogo";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { DEFAULT_CONFIRMATION_DEPTH } from "@/ui/common/constants";
import { useNetworkInfo } from "@/ui/common/hooks/client/api/useNetworkInfo";
import { usePrice } from "@/ui/common/hooks/client/api/usePrices";
import { FinalityProvider } from "@/ui/common/types/finalityProviders";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { calculateTokenValueInCurrency } from "@/ui/common/utils/formatCurrency";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";
import { blocksToDisplayTime } from "@/ui/common/utils/time";

import { ResponsiveDialog } from "../Modals/ResponsiveDialog";

interface RenewalPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onProceed: () => void;
  finalityProvider: FinalityProvider | null;
  stakingAmountSat: number;
  stakingTimelock: number;
  stakingFeeSat: number;
  feeRate: number;
  unbondingFeeSat: number;
  processing: boolean;
}

const { networkFullName: bbnNetworkFullName } = getNetworkConfigBBN();
const { coinSymbol, networkName, displayUSD } = getNetworkConfigBTC();

export const RenewalPreviewModal = ({
  open,
  onClose,
  finalityProvider,
  stakingAmountSat,
  stakingTimelock,
  onProceed,
  stakingFeeSat,
  feeRate,
  unbondingFeeSat,
  processing,
}: RenewalPreviewModalProps) => {
  const { data: networkInfo } = useNetworkInfo();
  const confirmationDepth =
    networkInfo?.params.btcEpochCheckParams?.latestParam
      ?.btcConfirmationDepth || DEFAULT_CONFIRMATION_DEPTH;
  const unbondingTime =
    blocksToDisplayTime(
      networkInfo?.params.bbnStakingParams?.latestParam?.unbondingTime,
    ) || "7 days";

  const btcInUsd = usePrice(coinSymbol);

  const previewFields = [
    {
      key: "Finality Provider",
      value: finalityProvider ? (
        <div className="inline-flex items-center gap-2">
          <FinalityProviderLogo
            logoUrl={finalityProvider.logo_url}
            rank={finalityProvider.rank}
            moniker={finalityProvider.description?.moniker}
            size="sm"
          />
          <span className="truncate">
            {finalityProvider.description?.moniker || "Unknown Provider"}
          </span>
        </div>
      ) : (
        "Unknown Provider"
      ),
    },
    {
      key: "Stake Amount",
      value: (
        <>
          {maxDecimals(satoshiToBtc(stakingAmountSat), 8)} {coinSymbol}
          {displayUSD && (
            <span className="ml-2 text-sm text-accent-secondary">
              {calculateTokenValueInCurrency(
                satoshiToBtc(stakingAmountSat),
                btcInUsd,
              )}
            </span>
          )}
        </>
      ),
    },
    {
      key: "Fee Rate",
      value: `${feeRate} sat/vB`,
    },
    {
      key: "Transaction Fees",
      value: (
        <>
          {maxDecimals(satoshiToBtc(stakingFeeSat), 8)} {coinSymbol}
          {displayUSD && (
            <span className="ml-2 text-sm text-accent-secondary">
              {calculateTokenValueInCurrency(
                satoshiToBtc(stakingFeeSat),
                btcInUsd,
              )}
            </span>
          )}
        </>
      ),
    },
    {
      key: "Term",
      value: (
        <>
          {stakingTimelock} blocks
          <br />
          <span className="text-md text-secondary">
            ~ {blocksToDisplayTime(stakingTimelock)}
          </span>
        </>
      ),
    },
    {
      key: "Unbonding",
      value: `~ ${unbondingTime}`,
    },
    {
      key: "Unbonding Fee",
      value: (
        <>
          {maxDecimals(satoshiToBtc(unbondingFeeSat), 8)} {coinSymbol}
          {displayUSD && (
            <span className="ml-2 text-sm text-accent-secondary">
              {calculateTokenValueInCurrency(
                satoshiToBtc(unbondingFeeSat),
                btcInUsd,
              )}
            </span>
          )}
        </>
      ),
    },
  ];

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Renew Staking Term"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto text-accent-primary">
        {/* Description message */}
        <Text variant="body2" className="text-secondary">
          Extend your current stake's duration without having to wait for
          unbonding. This helps maintain your active stake without interruption.
          Once the stake transaction is confirmed, your staking term extension
          will be active.
        </Text>

        {/* Preview fields */}
        <div className="flex flex-col">
          {previewFields.map((field, index) => (
            <div
              key={index}
              className="flex flex-row items-center justify-between py-3"
            >
              <Text variant="body1" className="text-secondary font-normal">
                {field.key}
              </Text>
              <Text
                variant="body1"
                className="text-secondary text-right font-normal"
              >
                {field.value}
              </Text>
            </div>
          ))}
        </div>

        <div className="divider mx-0 my-2" />
        {/* Attention section */}
        <div className="pt-2">
          <Heading variant="h6" className="text-primary mb-2">
            Attention!
          </Heading>
          <div className="flex flex-col gap-2">
            <Text variant="body2" className="text-secondary">
              1. No third party holds your staked {coinSymbol} — only you can
              unbond and withdraw it.
            </Text>
            <Text variant="body2" className="text-secondary">
              2. Your stake will first be sent to {bbnNetworkFullName} for
              verification (about 20 seconds), after which you'll be prompted to
              submit it to the {networkName} network. It will show as "Pending"
              until it receives {confirmationDepth} Bitcoin confirmations.
            </Text>
            <Text variant="body2" className="text-secondary">
              3. Please note: submitting this transaction will reset your
              stake's timelock.
            </Text>
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0 sm:flex-row">
        <Button
          variant="contained"
          color="primary"
          onClick={onProceed}
          className="w-full sm:order-2 sm:flex-1"
          disabled={processing}
        >
          {processing ? <Loader size={16} className="text-white" /> : "Sign"}
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={onClose}
          className="w-full sm:order-1 sm:flex-1"
        >
          Cancel
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
};
