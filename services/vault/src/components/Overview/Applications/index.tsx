import {
  Avatar,
  Button,
  Chip,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useApplications } from "../../../hooks/api/useApplications";

interface ApplicationLogoProps {
  logoUrl: string;
  name: string;
}

function ApplicationLogo({ logoUrl, name }: ApplicationLogoProps) {
  const [imageError, setImageError] = useState(false);

  if (imageError || !logoUrl) {
    return (
      <Avatar alt={name} size="large" variant="rounded" className="h-8 w-8">
        <Text
          as="span"
          className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-base font-medium text-accent-contrast"
        >
          {name.charAt(0).toUpperCase()}
        </Text>
      </Avatar>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className="h-8 w-8 rounded-2xl object-cover"
      onError={() => setImageError(true)}
    />
  );
}

export function Applications() {
  const { data: applications, isLoading, error } = useApplications();

  const header = (
    <h3 className="text-2xl font-normal capitalize text-accent-primary md:mb-6">
      Applications
    </h3>
  );

  if (error || !applications || applications.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <>
        {header}
        <div className="text-sm text-accent-secondary">Loading...</div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {applications.map((app) => (
          <SubSection
            key={app.id}
            className="flex flex-col gap-6 transition-all hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <ApplicationLogo
                  logoUrl={app.logoUrl}
                  name={app.name || app.type}
                />
                <h4 className="text-[20px] font-medium text-accent-primary">
                  {app.name || app.type}
                </h4>
              </div>
              <Chip>{app.type}</Chip>
            </div>

            {app.description && (
              <p className="flex-1 text-sm leading-relaxed text-accent-primary">
                {app.description}
              </p>
            )}

            <a
              href={app.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start"
            >
              <Button variant="outlined" rounded>
                Explore
              </Button>
            </a>
          </SubSection>
        ))}
      </div>
    </>
  );
}
