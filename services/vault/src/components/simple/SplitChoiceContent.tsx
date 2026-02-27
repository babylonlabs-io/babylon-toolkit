import { Button, Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Address } from "viem";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { getNetworkConfigBTC } from "@/config";
import { useSplitTransaction } from "@/hooks/deposit/useSplitTransaction";
import type { AllocationPlan } from "@/services/vault";

import type { SplitTxSignResult } from "../../hooks/deposit/depositFlowSteps";

const btcConfig = getNetworkConfigBTC();

interface SplitChoiceContentProps {
  vaultAmounts: bigint[];
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  onContinueToSplit: (
    plan: AllocationPlan,
    splitTxResult: SplitTxSignResult | null,
  ) => void;
  onDoNotSplit: () => void;
}

export function SplitChoiceContent({
  vaultAmounts,
  feeRate,
  btcWalletProvider,
  depositorEthAddress,
  selectedProviders,
  vaultProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  onContinueToSplit,
  onDoNotSplit,
}: SplitChoiceContentProps) {
  const { executeSplit, processing, error } = useSplitTransaction({
    vaultAmounts,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  });

  const handleContinueToSplit = async () => {
    const result = await executeSplit();
    if (result) {
      onContinueToSplit(result.plan, result.splitTxResult);
    }
  };

  return (
    <div className="flex w-full max-w-[520px] flex-col items-center gap-6 text-center">
      <img
        src={btcConfig.icon}
        alt={btcConfig.name}
        className="h-[100px] w-[100px]"
      />

      <div className="flex flex-col gap-4">
        <Heading variant="h5" className="text-accent-primary">
          Split your {btcConfig.name} into multiple vaults
        </Heading>

        <Text variant="body1" className="text-accent-secondary">
          Splitting your {btcConfig.coinSymbol} into multiple vaults allows for
          partial liquidation. If your position is liquidated, only part of your{" "}
          {btcConfig.coinSymbol} may be affected instead of the full amount.
        </Text>
      </div>

      {error && <StatusBanner variant="error">{error}</StatusBanner>}

      <div className="flex w-full flex-col gap-4">
        <Button
          variant="contained"
          color="primary"
          fluid
          disabled={processing}
          onClick={handleContinueToSplit}
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader size={16} className="text-accent-contrast" />
              <Text as="span" variant="body2" className="text-accent-contrast">
                Signing split transaction...
              </Text>
            </span>
          ) : error ? (
            "Retry Split"
          ) : (
            "Continue to Split (Recommended)"
          )}
        </Button>

        <Button
          variant="ghost"
          color="primary"
          fluid
          disabled={processing}
          onClick={onDoNotSplit}
        >
          Do not split
        </Button>
      </div>
    </div>
  );
}
