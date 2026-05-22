import { Card, Loader } from "@babylonlabs-io/core-ui";
import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  IoCheckmark,
  IoChevronUp,
  IoOpenOutline,
  IoWarningOutline,
} from "react-icons/io5";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { COPY } from "@/copy";
import type { VaultProviderListItem } from "@/types/vaultProvider";
import {
  formatBasisPointsAsPercent,
  formatBtcAmount,
} from "@/utils/formatting";

const FORM_COPY = COPY.deposit.form;

interface VaultProviderSelectorProps {
  providers: VaultProviderListItem[];
  isLoadingProviders: boolean;
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/**
 * A provider is "problematic" when it is runtime-unhealthy or its registered
 * rpcUrl was rejected. Both render with a warning icon under the
 * "currently unavailable" divider; only rejected ones are non-selectable.
 */
function isProblematic(provider: VaultProviderListItem): boolean {
  return provider.unhealthy || provider.unavailable;
}

/** Status line text for a provider row. */
function statusLabel(provider: VaultProviderListItem): string {
  if (provider.unavailable) {
    return provider.unavailableReason ?? FORM_COPY.providerStatusUnavailable;
  }
  if (provider.unhealthy) {
    return FORM_COPY.providerStatusUnhealthy;
  }
  return FORM_COPY.providerStatusActive;
}

/** Tooltip for the warning icon on a problematic provider. */
function warningTitle(provider: VaultProviderListItem): string {
  if (provider.unavailable) {
    return provider.unavailableReason ?? FORM_COPY.providerStatusUnavailable;
  }
  return FORM_COPY.providerUnhealthyReason;
}

/** Commission metric text, with a placeholder while it loads / on failure. */
function commissionText(provider: VaultProviderListItem): string {
  const value =
    provider.commissionBps === undefined
      ? FORM_COPY.providerMetricPlaceholder
      : formatBasisPointsAsPercent(provider.commissionBps);
  return `${FORM_COPY.providerCommissionLabel} ${value}`;
}

/** Active-BTC metric text, with a placeholder while it loads / on failure. */
function activeBtcText(provider: VaultProviderListItem): string {
  const value =
    provider.totalActiveSats === undefined
      ? FORM_COPY.providerMetricPlaceholder
      : formatBtcAmount(Number(formatSatoshisToBtc(provider.totalActiveSats)));
  return `${FORM_COPY.providerActiveLabel} ${value}`;
}

export function VaultProviderSelector({
  providers,
  isLoadingProviders,
  selectedProvider,
  onProviderSelect,
  expanded,
  onExpandedChange,
}: VaultProviderSelectorProps) {
  const selectedProviderData = providers.find((p) => p.id === selectedProvider);
  const headerLabel =
    selectedProviderData?.name ?? COPY.deposit.form.selectVaultProvider;

  // `providers` arrives pre-sorted (healthy first, problematic last), so the
  // first problematic entry marks where the "currently unavailable" group
  // starts. A divider is only meaningful when healthy providers precede it.
  const firstProblematicIndex = providers.findIndex(isProblematic);

  return (
    <>
      <Card variant="filled" className="!rounded-lg !py-4">
        <button
          type="button"
          className="flex w-full items-center justify-between"
          onClick={() => onExpandedChange(!expanded)}
        >
          <span
            className={`text-sm ${selectedProviderData ? "text-accent-primary" : "text-accent-secondary"}`}
          >
            {headerLabel}
          </span>
          <IoChevronUp
            className={`text-accent-primary transition-transform ${expanded ? "" : "rotate-180"}`}
          />
        </button>
      </Card>

      {expanded && (
        <Card
          variant="default"
          className="flex flex-col gap-6 !rounded-lg !bg-primary-contrast !py-4"
        >
          <span className="text-sm text-accent-secondary">
            {COPY.deposit.form.providerSelectDescription}
          </span>

          {isLoadingProviders ? (
            <div className="flex items-center justify-center py-2">
              <Loader size={24} className="text-primary-main" />
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-accent-secondary">
              {COPY.deposit.form.providerSelectEmpty}
            </p>
          ) : (
            providers.map((provider, index) => {
              const isSelected = provider.id === selectedProvider;
              const problematic = isProblematic(provider);
              // Runtime-unhealthy VPs stay selectable (health can recover);
              // metadata-rejected VPs do not.
              const isDisabled = provider.unavailable;
              const handleSelect = () => {
                if (isDisabled) return;
                onProviderSelect(provider.id);
                onExpandedChange(false);
              };
              return (
                <div key={provider.id} className="flex flex-col gap-6">
                  {index === firstProblematicIndex && index > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="tracking-wide text-xs uppercase text-accent-secondary">
                        {FORM_COPY.providerGroupUnavailableLabel}
                      </span>
                      <div className="h-px flex-1 bg-secondary-strokeLight" />
                    </div>
                  )}
                  <div
                    role="button"
                    tabIndex={isDisabled ? -1 : 0}
                    aria-disabled={isDisabled}
                    className={`flex w-full items-start justify-between gap-3 ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                    onClick={handleSelect}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSelect();
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <ApplicationLogo
                        logoUrl={provider.iconUrl ?? null}
                        name={provider.name}
                      />
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-accent-primary">
                            {provider.name}
                          </span>
                          {problematic && (
                            <IoWarningOutline
                              className="shrink-0 text-warning-main"
                              size={14}
                              title={warningTitle(provider)}
                            />
                          )}
                        </div>
                        <span className="text-xs text-accent-secondary">
                          {statusLabel(provider)}
                        </span>
                        <span className="text-xs text-accent-secondary">
                          {commissionText(provider)}
                          <span className="px-1.5">·</span>
                          {activeBtcText(provider)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={provider.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={FORM_COPY.providerExplorerLinkLabel}
                        title={FORM_COPY.providerExplorerLinkLabel}
                        className="text-accent-secondary transition-colors hover:text-accent-primary"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <IoOpenOutline size={16} />
                      </a>
                      {isSelected && (
                        <IoCheckmark
                          className="text-accent-primary"
                          size={20}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Card>
      )}
    </>
  );
}
