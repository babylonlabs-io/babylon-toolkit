import { Card, useIsMobile, Tabs } from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import { DepositOverview } from "./DepositOverview";
import { MarketOverview } from "./MarketOverview";
import { ActivityOverview } from "./ActivityOverview";
import { PositionOverview } from "./PositionOverview";
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
import { useVaultProviders } from "../hooks/useVaultProviders";
import { useUTXOs, calculateBalance } from "../hooks/useUTXOs";
import { useNetworkFees } from "../hooks/api/useNetworkFees";

export function VaultOverviewPanel() {
  const isMobile = useIsMobile();
  
  // Get wallet connections
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = useMemo(() => {
    return btcConnector?.connectedWallet?.provider || null;
  }, [btcConnector]);
  const { address: ethAddress } = useAccount();
  
  // Get BTC address from connected wallet
  const btcAddress = useMemo(() => {
    return btcConnector?.connectedWallet?.account?.address;
  }, [btcConnector]);
  
  // Fetch UTXOs and calculate BTC balance
  const { confirmedUTXOs } = useUTXOs(btcAddress);
  const btcBalanceSat = useMemo(
    () => calculateBalance(confirmedUTXOs),
    [confirmedUTXOs],
  );
  
  // Fetch vault providers from API
  const { providers } = useVaultProviders();

  // Fetch network fees from mempool.space API
  const { data: networkFees } = useNetworkFees();

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

  // Get selected provider's BTC public key and liquidators from API data
  const { selectedProviderBtcPubkey, liquidatorBtcPubkeys } = useMemo(() => {
    if (selectedProviders.length === 0 || providers.length === 0) {
      return {
        selectedProviderBtcPubkey: '',
        liquidatorBtcPubkeys: [],
      };
    }
    
    // Find the selected provider by ETH address (stored in id field)
    const selectedProvider = providers.find(
      (p) => p.id.toLowerCase() === selectedProviders[0].toLowerCase()
    );
    
    // Extract liquidator BTC public keys from API response
    // Strip 0x prefix as the WASM/transaction building expects raw hex
    const liquidators = selectedProvider?.liquidators && selectedProvider.liquidators.length > 0
      ? selectedProvider.liquidators.map(liq => liq.btc_pub_key.replace(/^0x/, ''))
      : [];
    
    return {
      selectedProviderBtcPubkey: selectedProvider?.btc_pub_key || '',
      liquidatorBtcPubkeys: liquidators,
    };
  }, [selectedProviders, providers]);

  // Calculate BTC transaction fee in satoshis
  // Use "halfHourFee" (medium priority) from mempool.space API
  // Convert from sat/vbyte to total sats (estimate ~200 vbytes for pegin tx)
  const btcTransactionFeeSats = useMemo(() => {
    if (!networkFees?.halfHourFee) {
      return 10_000n; // Fallback to 10k sats if API unavailable
    }
    // Estimate: ~200 vbytes for typical pegin transaction
    const estimatedVbytes = 200;
    return BigInt(Math.ceil(networkFees.halfHourFee * estimatedVbytes));
  }, [networkFees]);

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
            transactionFeeSats={btcTransactionFeeSats}
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
          transactionFeeSats={btcTransactionFeeSats}
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
