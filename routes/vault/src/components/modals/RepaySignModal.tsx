import { useEffect, useState } from "react";
import type { Hex } from "viem";
import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Step,
  Text,
} from "@babylonlabs-io/core-ui";
import { useRepayAndPegout } from "../../hooks/useRepayAndPegout";
import { ERC20, Morpho } from "../../clients/eth-contract";
import { CONTRACTS, MORPHO_MARKET_ID } from "../../config/contracts";

interface RepaySignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pegInTxHash?: Hex;
  /** Total amount to repay in USDC wei (6 decimals) */
  repayAmountWei?: bigint;
}

/**
 * RepaySignModal - Transaction signing modal for repay flow
 *
 * The repayAndPegout transaction:
 * 1. Repays the USDC loan to Morpho
 * 2. Withdraws vaultBTC collateral from Morpho
 * 3. Burns vaultBTC and initiates pegout to release BTC
 *
 */
export function RepaySignModal({
  open,
  onClose,
  onSuccess,
  pegInTxHash,
  repayAmountWei,
}: RepaySignModalProps) {
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0); // 0: not started, 1: approving, 2: repaying
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdcTokenAddress, setUsdcTokenAddress] = useState<Hex | null>(null);

  const { executeRepayAndPegout } = useRepayAndPegout();

  // Fetch USDC token address when modal opens
  useEffect(() => {
    if (open && pegInTxHash && !usdcTokenAddress) {
      const fetchUsdcAddress = async () => {
        try {
          const market = await Morpho.getMarketById(MORPHO_MARKET_ID);
          setUsdcTokenAddress(market.loanToken.address);
        } catch (err) {
          console.error('[RepaySignModal] Failed to fetch USDC address:', err);
          setError('Failed to load token information');
        }
      };
      fetchUsdcAddress();
    }
  }, [open, pegInTxHash, usdcTokenAddress]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setIsLoading(false);
      setError(null);
      setUsdcTokenAddress(null);
    }
  }, [open]);

  // Show error in console if transaction fails
  useEffect(() => {
    if (error) {
      console.error('[RepaySignModal] Transaction error:', error);
    }
  }, [error]);

  const handleSign = async () => {
    if (!pegInTxHash || !usdcTokenAddress || !repayAmountWei) {
      console.error('[RepaySignModal] Missing required data:', {
        pegInTxHash,
        usdcTokenAddress,
        repayAmountWei,
      });
      setError('Missing required transaction data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Add 1% buffer to approval amount to account for interest accrual between approval and repay
      const approvalAmount = (repayAmountWei * 101n) / 100n;

      // Step 1: Approve USDC spending
      console.log('[RepaySignModal] Step 1: Approving USDC spending', {
        usdcTokenAddress,
        spender: CONTRACTS.VAULT_CONTROLLER,
        exactDebt: repayAmountWei.toString(),
        exactDebtFormatted: (Number(repayAmountWei) / 1_000_000).toFixed(2) + ' USDC',
        approvalAmount: approvalAmount.toString(),
        approvalAmountFormatted: (Number(approvalAmount) / 1_000_000).toFixed(2) + ' USDC',
        buffer: '1% buffer for interest accrual',
      });
      setCurrentStep(1);

      const approvalResult = await ERC20.approveERC20(
        usdcTokenAddress,
        CONTRACTS.VAULT_CONTROLLER,
        approvalAmount
      );

      console.log('[RepaySignModal] USDC approval successful:', {
        txHash: approvalResult.transactionHash,
      });

      // Check allowance after approval
      const allowance = await ERC20.getERC20Allowance(
        usdcTokenAddress,
        CONTRACTS.VAULT_CONTROLLER
      );
      console.log('[RepaySignModal] Allowance after approval:', {
        allowance: allowance.toString(),
        allowanceFormatted: (Number(allowance) / 1_000_000).toFixed(2) + ' USDC',
      });

      // Step 2: Repay and pegout
      console.log('[RepaySignModal] Step 2: Repaying and initiating pegout', {
        pegInTxHash,
        vaultController: CONTRACTS.VAULT_CONTROLLER,
      });
      setCurrentStep(2);

      const result = await executeRepayAndPegout({ pegInTxHash });

      if (!result) {
        throw new Error('Repay transaction failed');
      }

      console.log('[RepaySignModal] Repay successful:', result.transactionHash);

      // Success - trigger success modal
      onSuccess();
    } catch (err) {
      console.error('[RepaySignModal] Transaction failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setCurrentStep(0);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Repaying in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text variant="body1" className="text-sm text-accent-secondary sm:text-base">
          Sign the transaction to repay your full loan balance (including interest) and withdraw your BTC.
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Approve USDC Spending
          </Step>
          <Step step={2} currentStep={currentStep}>
            Repay Full Loan & Withdraw BTC
          </Step>
        </div>

        {error && (
          <Text variant="body2" className="text-error-main text-sm">
            {error}
          </Text>
        )}
      </DialogBody>

      <DialogFooter className="flex gap-4">
        <Button
          variant="outlined"
          color="primary"
          onClick={onClose}
          className="flex-1 text-xs sm:text-base"
          disabled={isLoading}
        >
          Cancel
        </Button>

        <Button
          disabled={isLoading || !pegInTxHash || !usdcTokenAddress || !repayAmountWei}
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={handleSign}
        >
          {isLoading ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : (
            "Sign"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
