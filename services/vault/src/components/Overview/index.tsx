import { Card, Tabs, useIsMobile } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { calculateBalance, useUTXOs } from "../../hooks/useUTXOs";
import { useVaultDeposits } from "../../hooks/useVaultDeposits";
import type { Liquidator, VaultProvider } from "../../types/vaultProvider";
import { DepositOverview } from "./Deposits/DepositOverview";
import { CollateralDepositModal } from "./Deposits/DepositFormModal";
import { CollateralDepositReviewModal } from "./Deposits/DepositReviewModal";
import { CollateralDepositSuccessModal } from "./Deposits/DepositSuccessModal";
import { useVaultProviders } from "./Deposits/hooks/useVaultProviders";
// TODO: Uncomment when redeem flow is ready
// import { RedeemCollateralModal } from "../Collateral/Redeem/components/FormModal";
// import { RedeemCollateralReviewModal } from "../Collateral/Redeem/components/ReviewModal";
// import { RedeemCollateralSignModal } from "../Collateral/Redeem/components/SignModal";
// import { RedeemCollateralSuccessModal } from "../Collateral/Redeem/components/SuccessModal";
import {
  useVaultDepositState,
  VaultDepositState,
  VaultDepositStep,
} from "./Deposits/state/VaultDepositState";

import { Activity } from "./Activity";
import { CollateralDepositSignModal } from "./Deposits/DepositSignModal";
// TODO: Uncomment when redeem flow is ready
// import {
//   useVaultRedeemState,
//   VaultRedeemState,
//   VaultRedeemStep,
// } from "../Collateral/Redeem/state/VaultRedeemState";
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
    goToStep: goToDepositStep,
    setDepositData,
    setTransactionHashes: setDepositTransactionHashes,
    reset: resetDeposit,
  } = useVaultDepositState();

  // TODO: Uncomment when redeem flow is ready
  // Redeem flow state
  // const {
  //   step: redeemStep,
  //   redeemDepositIds,
  //   goToStep: goToRedeemStep,
  //   setTransactionHashes: setRedeemTransactionHashes,
  //   reset: resetRedeem,
  // } = useVaultRedeemState();

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

  // Get selected provider info for localStorage
  const selectedProviderInfo = useMemo(() => {
    if (selectedProviders.length === 0 || providers.length === 0) {
      return undefined;
    }
    const provider = providers.find(
      (p: VaultProvider) =>
        p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );
    if (!provider) return undefined;

    // Map VaultProvider to StoredProvider format
    return {
      id: provider.id,
      // Note: VaultProvider doesn't have name/icon from API yet
      // These can be added later when provider metadata is available
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
    goToDepositStep(VaultDepositStep.SUCCESS);
  };

  // TODO: Uncomment when redeem flow is ready
  // Redeem flow handlers
  // const handleRedeem = () => {
  //   // Proceed to review
  //   // Note: The RedeemCollateralModal now uses a simple amount input
  //   goToRedeemStep(VaultRedeemStep.REVIEW);
  // };

  // const handleRedeemReviewConfirm = () => {
  //   goToRedeemStep(VaultRedeemStep.SIGN);
  // };

  // const handleRedeemSignSuccess = (btcTxid: string, ethTxHash: string) => {
  //   setRedeemTransactionHashes(btcTxid, ethTxHash);
  //   goToRedeemStep(VaultRedeemStep.SUCCESS);
  // };

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
            selectedProviderInfo={selectedProviderInfo}
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

        {/* TODO: Uncomment when redeem flow is ready */}
        {/* Redeem Modal Flow */}
        {/* {redeemStep === VaultRedeemStep.FORM && (
            <RedeemCollateralModal
              open
              onClose={resetRedeem}
              onRedeem={handleRedeem}
            />
          )}
          {redeemStep === VaultRedeemStep.REVIEW && (
            <RedeemCollateralReviewModal
              open
              onClose={resetRedeem}
              onConfirm={handleRedeemReviewConfirm}
              depositIds={redeemDepositIds}
            />
          )}
          {redeemStep === VaultRedeemStep.SIGN && (
            <RedeemCollateralSignModal
              open
              onClose={resetRedeem}
              onSuccess={handleRedeemSignSuccess}
              depositIds={redeemDepositIds}
            />
          )}
          {redeemStep === VaultRedeemStep.SUCCESS && (
            <RedeemCollateralSuccessModal open onClose={resetRedeem} />
          )} */}
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
          selectedProviderInfo={selectedProviderInfo}
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

      {/* TODO: Uncomment when redeem flow is ready */}
      {/* Redeem Modal Flow */}
      {/* {redeemStep === VaultRedeemStep.FORM && (
          <RedeemCollateralModal
            open
            onClose={resetRedeem}
            onRedeem={handleRedeem}
          />
        )}
        {redeemStep === VaultRedeemStep.REVIEW && (
          <RedeemCollateralReviewModal
            open
            onClose={resetRedeem}
            onConfirm={handleRedeemReviewConfirm}
            depositIds={redeemDepositIds}
          />
        )}
        {redeemStep === VaultRedeemStep.SIGN && (
          <RedeemCollateralSignModal
            open
            onClose={resetRedeem}
            onSuccess={handleRedeemSignSuccess}
            depositIds={redeemDepositIds}
          />
        )}
        {redeemStep === VaultRedeemStep.SUCCESS && (
          <RedeemCollateralSuccessModal open onClose={resetRedeem} />
        )} */}
    </>
  );
}

export function Overview() {
  return (
    <VaultDepositState>
      {/* TODO: Uncomment when redeem flow is ready */}
      {/* <VaultRedeemState> */}
      <OverviewContent />
      {/* </VaultRedeemState> */}
    </VaultDepositState>
  );
}
