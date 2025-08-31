import React from 'react';
import { Avatar } from '../../../../components/Avatar';
import { Text } from '../../../../components/Text';
import { DisplayHash } from '../../../../components/DisplayHash';
import { CopyIcon } from '../../../../components/Icons';
import { Loader } from '../../../../components/Loader';
import { twJoin } from 'tailwind-merge';
import { formatCryptoBalance } from '../../../../utils/helpers';

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
  // Default balance formatter
  const defaultFormatBalance = (amount: number): string => {
    if (!coinSymbol) return amount.toString();
    return formatCryptoBalance(amount, coinSymbol);
  };

  const formatBalanceFn = formatBalance || defaultFormatBalance;

  // Render balance value with loading state
  const renderBalanceValue = (value?: number, showLoader = false) => {
    if (loading || showLoader) {
      return <Loader size={20} className="text-accent-primary" />;
    }

    if (value === undefined) {
      return <Text className="text-accent-secondary">N/A</Text>;
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
          {renderBalanceValue(balances.staked)}
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
          <div className="flex items-center gap-2">
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
          {renderBalanceValue(balances.available)}
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
        <div className="flex justify-start mb-2 md:mb-3">
          <Avatar
            alt={walletName || walletType}
            url={walletIcon || ''}
            size="large"
            className="w-8 h-8 md:w-10 md:h-10"
          />
        </div>

        <div className="flex justify-start mb-[1px]">
          <Text
            variant="body1"
            className="text-accent-secondary font-medium !text-xs"
          >
            {walletType} Wallet
          </Text>
        </div>

        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            {isCopied ? (
              <Text className="text-accent-primary !text-sm truncate whitespace-nowrap">
                Copied ✓
              </Text>
            ) : (
              <DisplayHash
                className="text-accent-primary !text-sm"
                value={address}
                symbols={6}
              />
            )}
          </div>
          <button
            onClick={onCopy}
            className="flex-shrink-0 ml-3 p-1 rounded hover:bg-[#d7e1e7] dark:hover:bg-[#252525] transition-colors h-6 w-6 flex items-center justify-center hover:opacity-80"
          >
            <CopyIcon size={14} className="md:w-4 md:h-4" />
          </button>
        </div>

        {/* Balance Sections - only show if balances are provided */}
        {balances && coinSymbol && (
          <div className="mt-3 space-y-2">
            {walletType === 'Bitcoin' ? renderBitcoinBalances() : renderBabylonBalances()}
          </div>
        )}
      </div>
    </div>
  );
};
