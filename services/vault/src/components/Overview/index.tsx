import { getETHChain } from "@babylonlabs-io/config";
import { Card, Tabs, useIsMobile } from "@babylonlabs-io/core-ui";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";
import type { Address, Hex, WalletClient } from "viem";
import { getWalletClient } from "wagmi/actions";

import { CONTRACTS } from "../../config";
import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { useBTCPrice } from "../../hooks/useBTCPrice";
import { calculateBalance, useUTXOs } from "../../hooks/useUTXOs";
import { useVaultDeposits } from "../../hooks/useVaultDeposits";
import { getPeginState } from "../../models/peginStateMachine";
import { redeemVaults } from "../../services/vault/vaultTransactionService";
import type { Liquidator, VaultProvider } from "../../types/vaultProvider";

import { Activity } from "./Activity";
import { CollateralDepositModal } from "./Deposits/DepositFormModal";
import { DepositOverview } from "./Deposits/DepositOverview";
import { CollateralDepositReviewModal } from "./Deposits/DepositReviewModal";
import { CollateralDepositSignModal } from "./Deposits/DepositSignModal";
import { CollateralDepositSuccessModal } from "./Deposits/DepositSuccessModal";
import { RedeemCollateralModal } from "./Deposits/RedeemFormModal";
import { RedeemCollateralReviewModal } from "./Deposits/RedeemReviewModal";
import { RedeemCollateralSuccessModal } from "./Deposits/RedeemSuccessModal";
import { useVaultProviders } from "./Deposits/hooks/useVaultProviders";
import {
  DepositState,
  DepositStep as DepositStateStep,
  useDepositState,
} from "./Deposits/state/DepositState";
import {
  useVaultRedeemState,
  VaultRedeemState,
  VaultRedeemStep,
} from "./Deposits/state/VaultRedeemState";
import { Market } from "./Market";
import { Position } from "./Position";

function OverviewContent() {
  const isMobile = useIsMobile();
  const [isSigning, setIsSigning] = useState(false);

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

  // Fetch BTC price from oracle
  const { btcPriceUSD } = useBTCPrice();

  // Fetch vault providers from API (keep this - it's a data fetch function)
  const { providers } = useVaultProviders();

  // Get activities and refetch function from useVaultDeposits
  const { activities, refetchActivities } = useVaultDeposits(ethAddress);

  // Deposit flow state
  const {
    step: depositStep,
    amount: depositAmount,
    selectedProviders,
    // btcTxid,
    goToStep: goToDepositStep,
    setDepositData,
    setTransactionHashes: setDepositTransactionHashes,
    reset: resetDeposit,
  } = useDepositState();

  // Redeem flow state
  const {
    step: redeemStep,
    redeemDepositIds,
    goToStep: goToRedeemStep,
    setRedeemData,
    reset: resetRedeem,
  } = useVaultRedeemState();

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
    goToDepositStep(DepositStateStep.REVIEW);
  };

  const handleDepositReviewConfirm = () => {
    goToDepositStep(DepositStateStep.SIGN);
  };

  const handleDepositSignSuccess = (btcTxid: string, ethTxHash: string) => {
    setDepositTransactionHashes(btcTxid, ethTxHash);
    // All 3 steps complete - go directly to success modal
    goToDepositStep(DepositStateStep.SUCCESS);
  };

  // Redeem flow handlers
  const handleRedeemNext = (depositIds: string[]) => {
    setRedeemData(depositIds);
    goToRedeemStep(VaultRedeemStep.REVIEW);
  };

  const handleRedeemReviewConfirm = async () => {
    setIsSigning(true);

    try {
      // Get wallet client
      const ethChain = getETHChain();
      const ethWalletClient = await getWalletClient(getSharedWagmiConfig(), {
        chainId: ethChain.id,
      });

      if (!ethWalletClient) {
        throw new Error("Ethereum wallet not connected");
      }

      // Get peg-in transaction hashes from activities
      const pegInTxHashes = activities
        .filter((a) => redeemDepositIds.includes(a.id))
        .map((a) => (a.txHash || a.id) as Hex)
        .filter((hash): hash is Hex => !!hash);

      if (pegInTxHashes.length === 0) {
        throw new Error("No valid transaction hashes found for redemption");
      }

      // Execute redemption transactions
      await redeemVaults(
        ethWalletClient as WalletClient,
        ethChain,
        CONTRACTS.VAULT_CONTROLLER,
        pegInTxHashes,
      );

      // Go to success modal
      setIsSigning(false);
      goToRedeemStep(VaultRedeemStep.SUCCESS);
    } catch (err) {
      setIsSigning(false);
      console.error("Redeem transaction failed:", err);
      // Optionally show error to user
      alert(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  const handleRedeemSuccessClose = () => {
    resetRedeem();
    refetchActivities(); // Refresh the deposit list
  };

  // Calculate total redeem amount for success modal
  const redeemTotalAmount = useMemo(() => {
    if (redeemDepositIds.length === 0) return 0;
    return activities
      .filter((a) => redeemDepositIds.includes(a.id))
      .reduce((sum, a) => sum + parseFloat(a.collateral.amount), 0);
  }, [activities, redeemDepositIds]);

  // Transform activities to deposits for modal
  const depositsForModal = useMemo(() => {
    return activities.map((activity) => {
      const state = getPeginState(activity.contractStatus ?? 0);

      return {
        id: activity.id,
        amount: parseFloat(activity.collateral.amount),
        vaultProvider: {
          address: activity.providers[0]?.id || "",
          name: activity.providers[0]?.name || "Unknown Provider",
          icon: activity.providers[0]?.icon || "",
        },
        pegInTxHash: activity.txHash || activity.id,
        status: state.displayLabel,
      };
    });
  }, [activities]);

  if (!isMobile) {
    return (
      <>
        <Card>
          <h3 className="mb-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
            Deposits
          </h3>
          <DepositOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
            Your Positions
          </h3>
          <Position />
        </Card>
        <Card>
          <h3 className="mb-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
            Markets
          </h3>
          <Market />
        </Card>
        <Card>
          <h3 className="mb-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
            Activity
          </h3>
          <Activity />
        </Card>

        {/* Deposit Modal Flow */}
        {depositStep === DepositStateStep.FORM && (
          <CollateralDepositModal
            open
            onClose={resetDeposit}
            onDeposit={handleDeposit}
            btcBalance={btcBalanceSat}
            btcPrice={btcPriceUSD}
          />
        )}
        {depositStep === DepositStateStep.REVIEW && (
          <CollateralDepositReviewModal
            open
            onClose={resetDeposit}
            onConfirm={handleDepositReviewConfirm}
            amount={depositAmount}
            providers={selectedProviders}
          />
        )}
        {depositStep === DepositStateStep.SIGN && (
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
        {depositStep === DepositStateStep.SUCCESS && (
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
            onNext={handleRedeemNext}
            deposits={depositsForModal}
          />
        )}
        {redeemStep === VaultRedeemStep.REVIEW && (
          <RedeemCollateralReviewModal
            open
            onClose={resetRedeem}
            onConfirm={handleRedeemReviewConfirm}
            depositIds={redeemDepositIds}
            deposits={depositsForModal}
            isSigning={isSigning}
          />
        )}
        {redeemStep === VaultRedeemStep.SUCCESS && (
          <RedeemCollateralSuccessModal
            open
            onClose={handleRedeemSuccessClose}
            totalAmount={redeemTotalAmount}
            depositCount={redeemDepositIds.length}
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
      {depositStep === DepositStateStep.FORM && (
        <CollateralDepositModal
          open
          onClose={resetDeposit}
          onDeposit={handleDeposit}
          btcBalance={btcBalanceSat}
          btcPrice={btcPriceUSD}
        />
      )}
      {depositStep === DepositStateStep.REVIEW && (
        <CollateralDepositReviewModal
          open
          onClose={resetDeposit}
          onConfirm={handleDepositReviewConfirm}
          amount={depositAmount}
          providers={selectedProviders}
        />
      )}
      {depositStep === DepositStateStep.SIGN && (
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
      {depositStep === DepositStateStep.SUCCESS && (
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
          onNext={handleRedeemNext}
          deposits={depositsForModal}
        />
      )}
      {redeemStep === VaultRedeemStep.REVIEW && (
        <RedeemCollateralReviewModal
          open
          onClose={resetRedeem}
          onConfirm={handleRedeemReviewConfirm}
          depositIds={redeemDepositIds}
          deposits={depositsForModal}
          isSigning={isSigning}
        />
      )}
      {redeemStep === VaultRedeemStep.SUCCESS && (
        <RedeemCollateralSuccessModal
          open
          onClose={handleRedeemSuccessClose}
          totalAmount={redeemTotalAmount}
          depositCount={redeemDepositIds.length}
        />
      )}
    </>
  );
}

export function Overview() {
  return (
    <DepositState>
      <VaultRedeemState>
        <OverviewContent />
      </VaultRedeemState>
    </DepositState>
  );
}
