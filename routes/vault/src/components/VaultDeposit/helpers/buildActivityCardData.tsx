/**
 * Helper functions for building ActivityCard UI data
 *
 * Handles PRESENTATION ONLY - all state logic lives in peginStateMachine.ts
 */

import {
  StatusBadge,
  ProviderItem,
  Warning,
  type ActivityCardData,
  type ActivityCardDetailItem,
} from '@babylonlabs-io/core-ui';
import { bitcoinIcon } from '../../../assets';
import { Hash } from '../../Hash';
import {
  getPrimaryActionButton,
  PeginAction,
  ContractStatus,
  type PeginState,
} from '../../../models/peginStateMachine';
import type { VaultActivity } from '../../../types';

export interface ActionHandlers {
  handleSign: () => void;
  handleBroadcast: () => void;
  handleRedeem?: () => void;
}

export interface ActionStates {
  signing: boolean;
  signError: string | null;
  broadcasting: boolean;
  broadcastError: string | null;
}

export interface BuildCardDataParams {
  activity: VaultActivity;
  peginState: PeginState;
  actionHandlers: ActionHandlers;
  actionStates: ActionStates;
  btcPublicKey?: string;
  txError?: Error | null;
}

/**
 * Build status detail with StatusBadge
 * Note: Display status comes from peginStateMachine.ts (single source of truth)
 * The state machine handles all 5 contract statuses including IN_POSITION (status 3)
 */
function buildStatusDetail(
  peginState: PeginState,
): ActivityCardDetailItem {
  return {
    label: 'Status',
    value: (
      <StatusBadge
        status={peginState.displayVariant as 'active' | 'inactive' | 'pending'}
        label={peginState.displayLabel}
      />
    ),
  };
}

/**
 * Build providers detail with ProviderItem elements
 */
function buildProvidersDetail(
  providers: VaultActivity['providers'],
): ActivityCardDetailItem {
  return {
    label: 'Vault Provider(s)',
    value: (
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <ProviderItem
            key={provider.id}
            name={provider.name}
            icon={provider.icon}
          />
        ))}
      </div>
    ),
  };
}

/**
 * Build tx hash detail (optional, for debugging)
 */
function buildTxHashDetail(txHash?: string): ActivityCardDetailItem | null {
  if (!txHash) return null;

  return {
    label: 'PegIn Tx Hash',
    value: <Hash value={txHash} symbols={12} />,
  };
}

/**
 * Build details array
 */
function buildDetails(
  activity: VaultActivity,
  peginState: PeginState,
): ActivityCardDetailItem[] {
  const statusDetail = buildStatusDetail(peginState);
  const providersDetail = buildProvidersDetail(activity.providers);
  const txHashDetail = buildTxHashDetail(activity.txHash);

  return [
    statusDetail,
    providersDetail,
    ...(txHashDetail ? [txHashDetail] : []),
  ];
}

/**
 * Build primary action button
 */
function buildPrimaryAction(
  peginState: PeginState,
  activity: VaultActivity,
  actionHandlers: ActionHandlers,
  actionStates: ActionStates,
): ActivityCardData['primaryAction'] {
  const primaryActionConfig = getPrimaryActionButton(peginState);
  if (!primaryActionConfig) return undefined;

  const { label, action } = primaryActionConfig;

  // Map action to handler and label
  let onClick: (() => void) | undefined;
  let displayLabel = label;

  if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
    onClick = actionHandlers.handleSign;
    displayLabel = actionStates.signing
      ? 'Signing...'
      : actionStates.signError
        ? 'Retry Sign'
        : label;
  } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
    onClick = actionHandlers.handleBroadcast;
    displayLabel = actionStates.broadcasting
      ? 'Broadcasting...'
      : actionStates.broadcastError
        ? 'Retry Sign & Broadcast'
        : label;
  } else if (action === PeginAction.REDEEM) {
    onClick = actionHandlers.handleRedeem || activity.action?.onClick;
    displayLabel = activity.action?.label || label;
  }

  if (!onClick) return undefined;

  return {
    label: displayLabel,
    onClick,
    variant: 'contained' as const,
    fullWidth: true,
  };
}

/**
 * Build warning message based on state and errors
 */
function buildWarning(
  activity: VaultActivity,
  peginState: PeginState,
  params: {
    btcPublicKey?: string;
    contractStatus: ContractStatus;
    txError?: Error | null;
    signError: string | null;
    broadcastError: string | null;
  },
): React.ReactNode {
  const { btcPublicKey, contractStatus, txError, signError, broadcastError } = params;

  // Priority order: specific errors first, then generic state messages
  if (activity.isPending && activity.pendingMessage) {
    return <Warning>{activity.pendingMessage}</Warning>;
  }

  if (contractStatus === ContractStatus.PENDING && !btcPublicKey) {
    return (
      <Warning>
        Unable to get BTC public key from wallet. Please reconnect your BTC wallet.
      </Warning>
    );
  }

  if (txError) {
    return <Warning>Failed to fetch transactions: {txError.message}</Warning>;
  }

  if (signError) {
    return <Warning>{signError}</Warning>;
  }

  if (broadcastError) {
    return <Warning>{broadcastError}</Warning>;
  }

  if (peginState.message) {
    return <Warning>{peginState.message}</Warning>;
  }

  return undefined;
}

/**
 * Build complete ActivityCardData from VaultActivity and state
 *
 * Note: All state logic comes from peginStateMachine.ts (single source of truth)
 * This helper only handles UI presentation/transformation
 */
export function buildActivityCardData(
  params: BuildCardDataParams,
): ActivityCardData {
  const {
    activity,
    peginState,
    actionHandlers,
    actionStates,
    btcPublicKey,
    txError,
  } = params;

  const details = buildDetails(activity, peginState);
  const primaryAction = buildPrimaryAction(
    peginState,
    activity,
    actionHandlers,
    actionStates,
  );

  const contractStatus = activity.contractStatus as ContractStatus;

  const warning = buildWarning(activity, peginState, {
    btcPublicKey,
    contractStatus,
    txError,
    signError: actionStates.signError,
    broadcastError: actionStates.broadcastError,
  });

  return {
    formattedAmount: `${activity.collateral.amount} ${activity.collateral.symbol}`,
    icon: activity.collateral.icon || bitcoinIcon,
    iconAlt: activity.collateral.symbol,
    details,
    warning,
    primaryAction,
  };
}
