import { Card, Tabs, useIsMobile } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { calculateBalance, useUTXOs } from "../../hooks/useUTXOs";
import { useVaultProviders } from "../Collateral/Deposit/hooks/useVaultProviders";

import { Activity } from "./Activity";
import {
  CollateralDepositModal,
  CollateralDepositReviewModal,
  CollateralDepositSignModal,
  CollateralDepositSuccessModal,
} from "../Collateral/Deposit/components";
import { DepositOverview } from "../Collateral/Deposit/components/DepositOverview";
import { useSelectedProviderData } from "../Collateral/Deposit/hooks/useSelectedProviderData";
import {
  useVaultDepositState,
  VaultDepositState,
  VaultDepositStep,
} from "../Collateral/Deposit/state/VaultDepositState";
import {
  RedeemCollateralModal,
  RedeemCollateralReviewModal,
  RedeemCollateralSignModal,
  RedeemCollateralSuccessModal,
} from "../Collateral/Redeem/components";
import {
  useVaultRedeemState,
  VaultRedeemState,
  VaultRedeemStep,
} from "../Collateral/Redeem/state/VaultRedeemState";
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

  const { providers } = useVaultProviders();

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

  // Redeem flow state
  const {
    step: redeemStep,
    redeemDepositIds,
    goToStep: goToRedeemStep,
    setTransactionHashes: setRedeemTransactionHashes,
    reset: resetRedeem,
  } = useVaultRedeemState();

  const { selectedProviderBtcPubkey, liquidatorBtcPubkeys } =
    useSelectedProviderData({
      selectedProviders,
      providers,
    });

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

  // Redeem flow handlers
  const handleRedeem = () => {
    // Proceed to review
    // Note: The RedeemCollateralModal now uses a simple amount input
    goToRedeemStep(VaultRedeemStep.REVIEW);
  };

  const handleRedeemReviewConfirm = () => {
    goToRedeemStep(VaultRedeemStep.SIGN);
  };

  const handleRedeemSignSuccess = (btcTxid: string, ethTxHash: string) => {
    setRedeemTransactionHashes(btcTxid, ethTxHash);
    goToRedeemStep(VaultRedeemStep.SUCCESS);
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
          />
        )}
        {depositStep === VaultDepositStep.SUCCESS && (
          <CollateralDepositSuccessModal
            open
            onClose={resetDeposit}
            amount={depositAmount}
          />
        )}

        {/* Redeem Modal Flow */}
        {redeemStep === VaultRedeemStep.FORM && (
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
        />
      )}
      {depositStep === VaultDepositStep.SUCCESS && (
        <CollateralDepositSuccessModal
          open
          onClose={resetDeposit}
          amount={depositAmount}
        />
      )}

      {/* Redeem Modal Flow */}
      {redeemStep === VaultRedeemStep.FORM && (
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
      )}
    </>
  );
}

export function Overview() {
  return (
    <VaultDepositState>
      <VaultRedeemState>
        <OverviewContent />
      </VaultRedeemState>
    </VaultDepositState>
  );
}
