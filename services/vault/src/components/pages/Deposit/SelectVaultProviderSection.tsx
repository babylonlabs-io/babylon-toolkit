import {
  Card,
  CheckIcon,
  ChevronRightIcon,
  Loader,
  ProviderAvatar,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { AiOutlinePlus } from "react-icons/ai";

import {
  SelectVaultProviderModal,
  type Provider,
} from "./SelectVaultProviderModal";

interface SelectVaultProviderSectionProps {
  providers: Provider[];
  isLoading: boolean;
  selectedProvider: string;
  error?: string;
  completed?: boolean;
  disabled?: boolean;
  onSelect: (providerId: string) => void;
}

export function SelectVaultProviderSection({
  providers,
  isLoading,
  selectedProvider,
  error,
  completed,
  disabled,
  onSelect,
}: SelectVaultProviderSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const selectedProviderData = providers.find((p) => p.id === selectedProvider);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleSelect = (providerId: string) => {
    onSelect(providerId);
    setIsModalOpen(false);
  };

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
        3. Select Vault Provider
        {completed && <CheckIcon size={26} variant="success" />}
      </h3>

      {isLoading ? (
        <SubSection className="flex w-full flex-col gap-2">
          <Loader size={32} className="text-primary-main" />
        </SubSection>
      ) : providers.length === 0 ? (
        <SubSection>
          <Text variant="body2" className="text-sm text-accent-secondary">
            No vault providers available at this time.
          </Text>
        </SubSection>
      ) : (
        <>
          <button
            onClick={handleOpenModal}
            disabled={disabled}
            aria-label={
              selectedProviderData
                ? "Change vault provider"
                : "Select vault provider"
            }
            className="flex w-full items-center justify-between rounded bg-surface px-6 py-[17.5px] text-left text-accent-primary transition-colors hover:bg-surface/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              {selectedProviderData && (
                <ProviderAvatar
                  name={selectedProviderData.name}
                  size="small"
                  className="h-8 w-8"
                />
              )}
              <span>{selectedProviderData?.name || "Add Vault Provider"}</span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center text-black dark:text-white">
              {selectedProviderData ? (
                <ChevronRightIcon />
              ) : (
                <AiOutlinePlus size={18} />
              )}
            </div>
          </button>
          {error && (
            <Text variant="body2" className="text-error mt-2 text-sm">
              {error}
            </Text>
          )}
        </>
      )}

      <SelectVaultProviderModal
        open={isModalOpen}
        providers={providers}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelect}
      />
    </Card>
  );
}
