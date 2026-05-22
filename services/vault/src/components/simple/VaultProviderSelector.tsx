import {
  Accordion,
  AccordionDetails,
  Card,
  Loader,
} from "@babylonlabs-io/core-ui";
import { IoCheckmark, IoChevronUp } from "react-icons/io5";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { COPY } from "@/copy";

interface VaultProviderOption {
  id: string;
  name: string;
  iconUrl?: string;
  unavailable?: boolean;
  unavailableReason?: string;
}

interface VaultProviderSelectorProps {
  providers: VaultProviderOption[];
  isLoadingProviders: boolean;
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
            providers.map((provider) => {
              const isSelected = provider.id === selectedProvider;
              const statusLabel = provider.unavailable
                ? (provider.unavailableReason ??
                  COPY.deposit.form.providerStatusUnavailable)
                : COPY.deposit.form.providerStatusActive;
              const handleSelect = () => {
                if (provider.unavailable) return;
                onProviderSelect(provider.id);
                onExpandedChange(false);
              };
              return (
                <div
                  key={provider.id}
                  role="button"
                  tabIndex={provider.unavailable ? -1 : 0}
                  aria-disabled={provider.unavailable}
                  className={`flex w-full items-center justify-between gap-3 ${provider.unavailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  onClick={handleSelect}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelect();
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <ApplicationLogo
                      logoUrl={provider.iconUrl ?? null}
                      name={provider.name}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm text-accent-primary">
                        {provider.name}
                      </span>
                      <span className="text-xs text-accent-secondary">
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <IoCheckmark
                      className="shrink-0 text-accent-primary"
                      size={20}
                    />
                  )}
                </div>
              );
            })
          )}
        </Card>
      </AccordionDetails>
    </Accordion>
  );
}
