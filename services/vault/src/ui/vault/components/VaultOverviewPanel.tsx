import { Card, useIsMobile, Tabs } from "@babylonlabs-io/core-ui";
import { DepositOverview } from "./DepositOverview";
import { MarketOverview } from "./MarketOverview";
import { PositionOverview } from "./PositionOverview";
import { ActivityOverview } from "./ActivityOverview";
import {
  CollateralDepositModal,
  CollateralDepositReviewModal,
  CollateralDepositSignModal,
  CollateralDepositSuccessModal,
  RedeemCollateralModal,
  RedeemCollateralReviewModal,
  RedeemCollateralSignModal,
  RedeemCollateralSuccessModal,
} from "./modals";
import { useVaultDepositState, VaultDepositStep } from "../state/VaultDepositState";
import { useVaultRedeemState, VaultRedeemStep } from "../state/VaultRedeemState";

export function VaultOverviewPanel() {
  const isMobile = useIsMobile();
  
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

  // Deposit flow handlers
  const handleDeposit = (amount: number, providers: string[]) => {
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
          <PositionOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Markets
          </h3>
          <MarketOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Activity
          </h3>
          <ActivityOverview />
        </Card>
        
        {/* Deposit Modal Flow */}
        {depositStep === VaultDepositStep.FORM && (
          <CollateralDepositModal
            open
            onClose={resetDeposit}
            onDeposit={handleDeposit}
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
          <RedeemCollateralSuccessModal
            open
            onClose={resetRedeem}
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
              content: <PositionOverview />,
            },
            {
              id: "markets",
              label: "Markets",
              content: <MarketOverview />,
            },
            {
              id: "activity",
              label: "Activity",
              content: <ActivityOverview />,
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
        <RedeemCollateralSuccessModal
          open
          onClose={resetRedeem}
        />
      )}
    </>
  );
}

