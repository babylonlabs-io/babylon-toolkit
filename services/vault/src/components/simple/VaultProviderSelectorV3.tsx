import {
  Accordion,
  AccordionDetails,
  Card,
  Loader,
} from "@babylonlabs-io/core-ui";
import { IoCheckmarkCircle, IoChevronUp, IoWarning } from "react-icons/io5";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { VAULT_PROVIDER_DOCS_URL } from "@/constants";
import { COPY } from "@/copy";
import type { VaultProviderListItem } from "@/types/vaultProvider";
import {
  formatBasisPointsAsPercent,
  formatBtcFromSats,
  formatTimeAgo,
} from "@/utils/formatting";
import { isProblematicVaultProvider } from "@/utils/sortVaultProviders";

const FORM_COPY = COPY.deposit.form;

/**
 * Props for both the v2 (`VaultProviderSelector`) and v3 pickers. Declared
 * here so the v2 file can be deleted whole when ENABLE_V3_UI retires.
 */
export interface VaultProviderSelectorProps {
  providers: VaultProviderListItem[];
  isLoadingProviders: boolean;
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/**
 * Status line under a provider name: the rejection / unhealthy reason for a
 * problematic provider, otherwise "Active".
 */
function statusLabel(provider: VaultProviderListItem): string {
  if (provider.unavailable) {
    return provider.unavailableReason ?? FORM_COPY.providerStatusUnavailable;
  }
  if (provider.unhealthy) {
    return FORM_COPY.providerStatusUnhealthy;
  }
  return FORM_COPY.providerStatusActive;
}

/** Commission metric value, with a placeholder while it loads / on failure. */
function commissionValue(provider: VaultProviderListItem): string {
  return provider.commissionBps === undefined
    ? FORM_COPY.providerMetricPlaceholder
    : formatBasisPointsAsPercent(provider.commissionBps);
}

/** Active-BTC metric value, with a placeholder while it loads / on failure. */
function activeBtcValue(provider: VaultProviderListItem): string {
  return provider.totalActiveSats === undefined
    ? FORM_COPY.providerMetricPlaceholder
    : formatBtcFromSats(provider.totalActiveSats);
}

/** Relative time of the VP's latest activated vault; placeholder if none. */
function lastDepositValue(provider: VaultProviderListItem): string {
  return provider.lastSuccessfulPeginAt === undefined
    ? FORM_COPY.providerMetricPlaceholder
    : formatTimeAgo(provider.lastSuccessfulPeginAt);
}

/** One right-hand metric column of a provider row: value over label. */
function metricColumn(value: string, label: string) {
  return (
    <span className="flex min-w-[60px] flex-col justify-center whitespace-nowrap">
      <span className="text-xs text-accent-primary">{value}</span>
      <span className="text-[8px] text-accent-secondary">{label}</span>
    </span>
  );
}

export function VaultProviderSelectorV3({
  providers,
  isLoadingProviders,
  selectedProvider,
  onProviderSelect,
  expanded,
  onExpandedChange,
}: VaultProviderSelectorProps) {
  const selectedProviderData = providers.find((p) => p.id === selectedProvider);
  const headerLabel =
    selectedProviderData?.name ?? FORM_COPY.selectVaultProvider;

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
          className="flex w-full flex-col gap-4 !rounded-lg !bg-primary-contrast !py-4"
        >
          {/* The "choose a provider" prompt only makes sense when there is
              something to choose. Hidden in the empty state (e.g. every VP
              disabled) so it doesn't contradict the empty message below. */}
          {(isLoadingProviders || providers.length > 0) && (
            <span className="flex flex-col">
              <span className="text-sm text-accent-secondary">
                {FORM_COPY.providerSelectDescriptionV3}
                <a
                  href={VAULT_PROVIDER_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-main underline"
                >
                  {FORM_COPY.providerSelectDescriptionLink}
                </a>
              </span>
              <span className="text-xs text-accent-secondary">
                {FORM_COPY.providerSortNote}
              </span>
            </span>
          )}

          {isLoadingProviders ? (
            <div className="flex items-center justify-center py-2">
              <Loader size={24} className="text-primary-main" />
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-accent-secondary">
              {FORM_COPY.providerSelectEmpty}
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
              return (
                <div key={provider.id} className="flex flex-col gap-4">
                  {index === firstProblematicIndex && index > 0 && (
                    <div className="h-px w-full bg-secondary-strokeLight" />
                  )}
                  {/* The whole row is the selection control; the metrics are
                      fixed columns on the right. Rows carry no selected
                      styling — picking one collapses the panel and the
                      collapsed header names the chosen provider. */}
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={handleSelect}
                    aria-pressed={isSelected}
                    className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-4 rounded-md px-2 py-2 text-left ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span className="flex items-center gap-2">
                      {/* Avatar carries a status badge: a check for a healthy
                          provider, a warning for an unreachable / rejected
                          one. The badge sits on the card background so it
                          punches out of the avatar edge. */}
                      <span className="relative shrink-0">
                        <ApplicationLogo
                          logoUrl={provider.iconUrl ?? null}
                          name={provider.name}
                          size="sm"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full bg-primary-contrast">
                          {problematic ? (
                            <IoWarning
                              className="text-error-main"
                              size={10}
                              title={statusLabel(provider)}
                            />
                          ) : (
                            <IoCheckmarkCircle
                              className="text-success-bright"
                              size={12}
                            />
                          )}
                        </span>
                      </span>
                      <span className="flex flex-col justify-center">
                        <span className="text-sm text-accent-primary">
                          {provider.name}
                        </span>
                        <span
                          className={`text-[10px] ${problematic ? "text-error-main" : "text-success-bright"}`}
                        >
                          {statusLabel(provider)}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      {metricColumn(
                        commissionValue(provider),
                        FORM_COPY.providerCommissionLabel,
                      )}
                      {metricColumn(
                        activeBtcValue(provider),
                        FORM_COPY.providerActiveBtcLabel,
                      )}
                      {metricColumn(
                        lastDepositValue(provider),
                        FORM_COPY.providerLastDepositLabel,
                      )}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </Card>
      </AccordionDetails>
    </Accordion>
  );
}
