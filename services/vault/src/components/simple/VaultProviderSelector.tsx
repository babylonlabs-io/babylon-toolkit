import {
  Accordion,
  AccordionDetails,
  Card,
  Loader,
} from "@babylonlabs-io/core-ui";
import { IoChevronUp, IoWarningOutline } from "react-icons/io5";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { ExplorerLink } from "@/components/shared";
import { COPY } from "@/copy";
import type { VaultProviderListItem } from "@/types/vaultProvider";
import {
  formatBasisPointsAsPercent,
  formatBtcFromSats,
} from "@/utils/formatting";
import { isProblematicVaultProvider } from "@/utils/sortVaultProviders";

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
 * Status line text for a problematic provider row. Healthy providers don't
 * show a status line at all — selection state is conveyed by the row's
 * background tint, so a redundant "Active" label would just add noise.
 * Returns null when there is nothing to surface.
 */
function statusLabel(provider: VaultProviderListItem): string | null {
  if (provider.unavailable) {
    return provider.unavailableReason ?? FORM_COPY.providerStatusUnavailable;
  }
  if (provider.unhealthy) {
    return FORM_COPY.providerStatusUnhealthy;
  }
  return null;
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
      : formatBtcFromSats(provider.totalActiveSats);
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
  const firstProblematicIndex = providers.findIndex(isProblematicVaultProvider);

  return (
    <Accordion expanded={expanded}>
      <Card variant="filled" className="!rounded-lg !p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-4"
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

      <AccordionDetails className="pt-4">
        <Card
          variant="default"
          className="flex w-full flex-col gap-6 !rounded-lg !bg-primary-contrast !py-4"
        >
          {/* The "choose a provider" prompt only makes sense when there is
              something to choose. Hidden in the empty state (e.g. every VP
              disabled) so it doesn't contradict the empty message below. */}
          {(isLoadingProviders || providers.length > 0) && (
            <span className="text-sm text-accent-secondary">
              {COPY.deposit.form.providerSelectDescription}
            </span>
          )}

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
              const problematic = isProblematicVaultProvider(provider);
              // Runtime-unhealthy VPs stay selectable (health can recover);
              // metadata-rejected VPs do not.
              const isDisabled = provider.unavailable;
              const handleSelect = () => {
                if (isDisabled) return;
                onProviderSelect(provider.id);
                onExpandedChange(false);
              };
              const status = statusLabel(provider);
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
                  {/* Row is a flex container holding two SIBLING controls — the
                      selection button (left) and the explorer link (right) —
                      so the link isn't nested inside another interactive
                      element. The selected row gets a tinted background as
                      the only selection indicator. */}
                  <div
                    className={`-mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-md px-2 py-2 transition-colors ${isSelected ? "bg-primary-light/20" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={handleSelect}
                      aria-pressed={isSelected}
                      className={`flex flex-1 items-start gap-3 text-left ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                    >
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
                        {status !== null && (
                          <span className="text-xs text-accent-secondary">
                            {status}
                          </span>
                        )}
                        <span className="text-xs text-accent-secondary">
                          {commissionText(provider)}
                          <span className="px-1.5">·</span>
                          {activeBtcText(provider)}
                        </span>
                      </div>
                    </button>
                    {provider.explorerUrl && (
                      <div className="flex shrink-0 items-center gap-2">
                        <ExplorerLink
                          href={provider.explorerUrl}
                          label={FORM_COPY.providerExplorerLinkLabel}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </AccordionDetails>
    </Accordion>
  );
}
