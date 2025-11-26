import {
  Card,
  Loader,
  ProviderCard,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";

import { ApplicationLogo } from "../../ApplicationLogo";

interface Application {
  id: string;
  name: string;
  type: string;
  logoUrl: string | null;
}

interface SelectApplicationSectionProps {
  applications: Application[];
  isLoading: boolean;
  selectedApplication: string;
  error?: string;
  onSelect: (applicationId: string) => void;
}

export function SelectApplicationSection({
  applications,
  isLoading,
  selectedApplication,
  error,
  onSelect,
}: SelectApplicationSectionProps) {
  return (
    <Card>
      <h3 className="mb-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
        2. Select Application
      </h3>
      {isLoading ? (
        <SubSection className="flex w-full flex-col gap-2">
          <Loader size={32} className="text-primary-main" />
        </SubSection>
      ) : applications.length === 0 ? (
        <SubSection>
          <Text variant="body2" className="text-sm text-accent-secondary">
            No applications available at this time.
          </Text>
        </SubSection>
      ) : (
        <SubSection>
          {applications.map((app) => (
            <ProviderCard
              key={app.id}
              id={app.id}
              name={app.name}
              icon={<ApplicationLogo logoUrl={app.logoUrl} name={app.name} />}
              isSelected={selectedApplication === app.id}
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
