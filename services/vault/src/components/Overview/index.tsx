import { Card, Tabs, useIsMobile } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { calculateBalance, useUTXOs } from "../../hooks/useUTXOs";
import { useVaultDeposits } from "../../hooks/useVaultDeposits";
import type { Liquidator, VaultProvider } from "../../types/vaultProvider";

import { Activity } from "./Activity";
import { CollateralDepositModal } from "./Deposits/DepositFormModal";
import { DepositOverview } from "./Deposits/DepositOverview";
import { CollateralDepositReviewModal } from "./Deposits/DepositReviewModal";
import { CollateralDepositSignModal } from "./Deposits/DepositSignModal";
import { CollateralDepositSuccessModal } from "./Deposits/DepositSuccessModal";
import { useVaultProviders } from "./Deposits/hooks/useVaultProviders";
import {
  useVaultDepositState,
  VaultDepositState,
  VaultDepositStep,
} from "./Deposits/state/VaultDepositState";
import { Market } from "./Market";
import { Position } from "./Position";

function OverviewContent() {
  const isMobile = useIsMobile();

  // Wallet providers
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider || null;
  const { address: btcAddress } = useBTCWallet();
  const { address: ethAddressRaw } = useETHWallet();
  const ethAddress = ethAddressRaw as Address | undefined;
  const { confirmedUTXOs } = useUTXOs(btcAddress);

  const btcBalanceSat = useMemo(() => {
    return BigInt(calculateBalance(confirmedUTXOs || []));
  }, [confirmedUTXOs]);

  // Fetch vault providers from API (keep this - it's a data fetch function)
  const { providers } = useVaultProviders();

  // Get refetch function from useVaultDeposits to trigger refresh after deposit
  const { refetchActivities } = useVaultDeposits(ethAddress);

  // Deposit flow state
  const {
    step: depositStep,
    depositAmount,
    selectedProviders,
    // btcTxid,
    goToStep: goToDepositStep,
    setDepositData,
    setTransactionHashes: setDepositTransactionHashes,
    reset: resetDeposit,
  } = useVaultDepositState();

  // Get selected provider's BTC public key and liquidators from API data
  const { selectedProviderBtcPubkey, liquidatorBtcPubkeys } = useMemo(() => {
    if (selectedProviders.length === 0 || providers.length === 0) {
      return {
        selectedProviderBtcPubkey: "",
        liquidatorBtcPubkeys: [],
      };
    }

    // Find the selected provider by ETH address
    const selectedProvider = providers.find(
      (p: VaultProvider) =>
        p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );

    // Extract BTC public keys from liquidator objects
    const liquidators =
      selectedProvider?.liquidators?.map(
        (liq: Liquidator) => liq.btc_pub_key,
      ) || [];

    return {
      selectedProviderBtcPubkey: selectedProvider?.btc_pub_key || "",
      liquidatorBtcPubkeys: liquidators,
    };
  }, [selectedProviders, providers]);

  // Deposit flow handlers
  const handleDeposit = (amount: bigint, providers: string[]) => {
    setDepositData(amount, providers);
    goToDepositStep(VaultDepositStep.REVIEW);
  };

  const handleDepositReviewConfirm = () => {
    goToDepositStep(VaultDepositStep.SIGN);
  };

  const handleDepositSignSuccess = (btcTxid: string, ethTxHash: string) => {
    setDepositTransactionHashes(btcTxid, ethTxHash);
    // All 3 steps complete - go directly to success modal
    goToDepositStep(VaultDepositStep.SUCCESS);
  };

  if (!isMobile) {
    return (
      <>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Deposits
          </h3>
          <DepositOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Your Positions
          </h3>
          <Position />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Markets
          </h3>
          <Market />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Activity
          </h3>
          <Activity />
        </Card>

        {/* Deposit Modal Flow */}
        {depositStep === VaultDepositStep.FORM && (
          <CollateralDepositModal
            open
            onClose={resetDeposit}
            onDeposit={handleDeposit}
            btcBalance={btcBalanceSat}
          />
        )}
        {depositStep === VaultDepositStep.REVIEW && (
          <CollateralDepositReviewModal
            open
            onClose={resetDeposit}
            onConfirm={handleDepositReviewConfirm}
            amount={depositAmount}
            providers={selectedProviders}
          />
        )}
        {depositStep === VaultDepositStep.SIGN && (
          <CollateralDepositSignModal
            open
            onClose={resetDeposit}
            onSuccess={handleDepositSignSuccess}
            amount={depositAmount}
            btcWalletProvider={btcWalletProvider}
            depositorEthAddress={ethAddress}
            selectedProviders={selectedProviders}
            vaultProviderBtcPubkey={selectedProviderBtcPubkey}
            liquidatorBtcPubkeys={liquidatorBtcPubkeys}
            onRefetchActivities={refetchActivities}
          />
        )}
        {depositStep === VaultDepositStep.SUCCESS && (
          <CollateralDepositSuccessModal
            open
            onClose={resetDeposit}
            amount={depositAmount}
          />
        )}
      </>
    );
  }
  return (
    <>
      <Card>
        <Tabs
          items={[
            {
              id: "deposits",
              label: "Deposits",
              content: <DepositOverview />,
            },
            {
              id: "positions",
              label: "Positions",
              content: <Position />,
            },
            {
              id: "markets",
              label: "Markets",
              content: <Market />,
            },
            {
              id: "activity",
              label: "Activity",
              content: <Activity />,
            },
          ]}
          defaultActiveTab="deposits"
        />
      </Card>

      {/* Deposit Modal Flow */}
      {depositStep === VaultDepositStep.FORM && (
        <CollateralDepositModal
          open
          onClose={resetDeposit}
          onDeposit={handleDeposit}
          btcBalance={btcBalanceSat}
        />
      )}
      {depositStep === VaultDepositStep.REVIEW && (
        <CollateralDepositReviewModal
          open
          onClose={resetDeposit}
          onConfirm={handleDepositReviewConfirm}
          amount={depositAmount}
          providers={selectedProviders}
        />
      )}
      {depositStep === VaultDepositStep.SIGN && (
        <CollateralDepositSignModal
          open
          onClose={resetDeposit}
          onSuccess={handleDepositSignSuccess}
          amount={depositAmount}
          btcWalletProvider={btcWalletProvider}
          depositorEthAddress={ethAddress}
          selectedProviders={selectedProviders}
          vaultProviderBtcPubkey={selectedProviderBtcPubkey}
          liquidatorBtcPubkeys={liquidatorBtcPubkeys}
          onRefetchActivities={refetchActivities}
        />
      )}
      {depositStep === VaultDepositStep.SUCCESS && (
        <CollateralDepositSuccessModal
          open
          onClose={resetDeposit}
          amount={depositAmount}
        />
      )}
    </>
  );
}

export function Overview() {
  return (
    <VaultDepositState>
      <OverviewContent />
    </VaultDepositState>
  );
}
