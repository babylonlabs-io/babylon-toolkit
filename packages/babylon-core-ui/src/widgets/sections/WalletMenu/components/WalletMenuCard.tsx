import React from 'react';
import { Avatar } from '../../../../components/Avatar';
import { Text } from '../../../../components/Text';
import { DisplayHash } from '../../../../components/DisplayHash';
import { CopyIcon } from '../../../../components/Icons';
import { Loader } from '../../../../components/Loader';
import { twJoin } from 'tailwind-merge';

/**
 * Balance data structure for wallet display
 */
export interface WalletBalanceData {
  /** Available balance (stakable for BTC, total for BBN) */
  available?: number;
  /** Amount currently staked (BTC only) */
  staked?: number;
  /** Amount available for staking (BTC only) */
  stakable?: number;
  /** Total balance including inscriptions (BTC only) */
  total?: number;
  /** Amount locked in inscriptions (BTC only) */
  inscriptions?: number;
}

export interface WalletMenuCardProps {
  walletType: 'Bitcoin' | 'Babylon';
  walletName?: string;
  walletIcon?: string;
  address: string;
  isCopied: boolean;
  onCopy: () => void;
  className?: string;

  // Balance-related props
  balances?: WalletBalanceData;
  coinSymbol?: string;
  isBalanceLoading?: boolean;
  hasUnconfirmedTransactions?: boolean;
  formatBalance?: (amount: number) => string;
}

export const WalletMenuCard: React.FC<WalletMenuCardProps> = ({
  walletType,
  walletName,
  walletIcon,
  address,
  isCopied,
  onCopy,
  className,
  balances,
  coinSymbol,
  isBalanceLoading: loading = false,
  hasUnconfirmedTransactions = false,
  formatBalance,
}) => {
  // Simple fallback formatter (consumers should provide their own formatBalance)
  const defaultFormatBalance = (amount: number): string => {
    if (!coinSymbol) return amount.toString();
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })} ${coinSymbol}`;
  };

  const formatBalanceFn = formatBalance || defaultFormatBalance;

  // Render balance value with loading state
  const renderBalanceValue = (value?: number, showLoader = false) => {
    if (loading || showLoader) {
      return <Loader size={20} className="text-accent-primary" />;
    }

    if (value === undefined) {
      return <Text className="text-accent-secondary text-sm">N/A</Text>;
    }

    return (
      <Text variant="body1" className="text-accent-primary !text-sm">
        {formatBalanceFn(value)}
      </Text>
    );
  };

  // Render Bitcoin-specific balance sections
  const renderBitcoinBalances = () => (
    <>
      {/* Staked Balance */}
      {balances?.staked !== undefined && (
        <div className="flex flex-col mb-1">
          <Text
            variant="body1"
            className="text-accent-secondary font-medium !text-xs"
          >
            Staked Balance
          </Text>
          <div data-testid="staked-balance">
            {renderBalanceValue(balances.staked)}
          </div>
        </div>
      )}

      {/* Stakable Balance */}
      {balances?.stakable !== undefined && (
        <div className="flex flex-col">
          <Text
            variant="body1"
            className="text-accent-secondary font-medium !text-xs"
          >
            Stakable Balance
          </Text>
          <div className="flex items-center gap-2" data-testid="stakable-balance">
            {renderBalanceValue(balances.stakable, loading || hasUnconfirmedTransactions)}
          </div>
        </div>
      )}
    </>
  );

  // Render Babylon-specific balance sections
  const renderBabylonBalances = () => (
    <>
      {/* Available Balance */}
      {balances?.available !== undefined && (
        <div className="flex flex-col">
          <Text
            variant="body1"
            className="text-accent-secondary font-medium !text-xs"
          >
            Balance
          </Text>
          <div data-testid="babylon-balance">
            {renderBalanceValue(balances.available)}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={twJoin(
      "bg-[#F9F9F9] dark:bg-[#2F2F2F] rounded-[4px] p-3 flex-1 md:p-4",
      className
    )}>
      <div className="flex flex-col w-full">
        <div className="flex items-center gap-2.5 mb-2 md:mb-3">
          <Avatar
            alt={walletName || walletType}
            url={walletIcon || ''}
            size="large"
            className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0"
          />
          
          <div className="flex flex-1 flex-col items-start min-w-0">
            <Text
              variant="body1"
              className="text-accent-primary font-medium text-xs"
            >
              {walletType} Wallet
            </Text>
            <div className="flex items-center gap-1">
              {isCopied ? (
                <Text className="text-accent-secondary text-xs">
                  Copied ✓
                </Text>
              ) : (
                <DisplayHash
                  className="text-accent-secondary text-xs"
                  value={address}
                  symbols={6}
                />
              )}
              <button
                onClick={onCopy}
                className="flex-shrink-0 p-1 rounded hover:bg-[#d7e1e7] dark:hover:bg-[#252525] transition-colors h-6 w-6 flex items-center justify-center hover:opacity-80"
              >
                <CopyIcon size={14} className="md:w-4 md:h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Balance Sections - only show if balances are provided */}
        {balances && coinSymbol && (
          <div className="space-y-2">
            {walletType === 'Bitcoin' ? renderBitcoinBalances() : renderBabylonBalances()}
          </div>
        )}
      </div>
    </div>
  );
};
