import {
  Card,
  Loader,
  ProviderCard,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";

interface Provider {
  id: string;
  name: string;
  btcPubkey: string;
}

interface SelectVaultProviderSectionProps {
  providers: Provider[];
  isLoading: boolean;
  selectedProvider: string;
  error?: string;
  onSelect: (providerId: string) => void;
}

export function SelectVaultProviderSection({
  providers,
  isLoading,
  selectedProvider,
  error,
  onSelect,
}: SelectVaultProviderSectionProps) {
  return (
    <Card>
      <h3 className="mb-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
        3. Select Vault Provider
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
        <SubSection>
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              id={provider.id}
              name={provider.name}
              icon={
                <Text
                  variant="body2"
                  className="text-sm font-medium text-accent-contrast"
                >
                  {provider.id.replace(/^0x/, '').charAt(0).toUpperCase()}
                </Text>
              }
              isSelected={selectedProvider === provider.id}
              onToggle={onSelect}
            />
          ))}
          {error && (
            <Text variant="body2" className="text-error mt-2 text-sm">
              {error}
            </Text>
          )}
        </SubSection>
      )}
    </Card>
  );
}
