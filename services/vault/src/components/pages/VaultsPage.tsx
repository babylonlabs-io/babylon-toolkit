/**
 * VaultsPage — the v3 /vaults route (issue #2041).
 *
 * Owns the page container, the empty state, and the load-error state. The
 * vault summary card and the lifecycle sections (pending deposits,
 * active/inactive vaults, withdrawals) land in follow-up steps of the same
 * issue, so a non-empty position renders no sections yet.
 */

import { Container, Loader } from "@babylonlabs-io/core-ui";
import { useOutletContext } from "react-router";

import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { DepositButton, EmptyState } from "@/components/shared";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { isDepositBlocked } from "@/components/shared/protocolStatus";
import { FeatureFlags } from "@/config";
import { useConnection } from "@/context/wallet";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { useVaultsPageEmptiness } from "@/hooks/useVaultsPageEmptiness";

const EMPTY_ILLUSTRATION_SRC = "/images/vaults-empty.svg";

export default function VaultsPage() {
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { isConnected } = useConnection();
  const gate = useProtocolGateState();
  const { isLoading, isEmpty, hasError } = useVaultsPageEmptiness();

  const isDepositsPaused = FeatureFlags.isDepositDisabled;

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader />
        </div>
      );
    }
    if (hasError) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-base text-accent-secondary">
            {COPY.vaults.loadError}
          </p>
        </div>
      );
    }
    if (!isEmpty) return null;
    return (
      <EmptyState
        illustration={
          <img
            src={EMPTY_ILLUSTRATION_SRC}
            alt=""
            className="mb-2 h-[100px] w-[94px]"
          />
        }
        title={
          isDepositsPaused
            ? COPY.deposit.disabled.title
            : COPY.vaults.empty.title
        }
        description={
          isDepositsPaused
            ? COPY.deposit.disabled.description
            : COPY.vaults.empty.description
        }
        isConnected={isConnected}
        action={
          <DepositButton
            // This control's data-testid is a real-wallet E2E hook
            // (e2e/real/actions/walletConnect.ts, e2e/real/actions/pegin.ts)
            // — carry it over if you move or rename the element.
            data-testid="deposit-button"
            variant="contained"
            color="secondary"
            size="medium"
            onClick={() => openDeposit()}
            disabled={isDepositBlocked(gate)}
          >
            {COPY.vaults.empty.depositAction}
          </DepositButton>
        }
      />
    );
  };

  return (
    <Container as="main" className={`${PAGE_CONTENT_CLASS} pb-6`}>
      {renderBody()}
    </Container>
  );
}
