import { Button, Chip, SubSection, Text } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import { getAppIdByController } from "../../applications";
import { useApplications } from "../../hooks/useApplications";
import { ApplicationLogo } from "../ApplicationLogo";

import { AaveBanner } from "./AaveBanner";

export function Applications() {
  const navigate = useNavigate();
  const {
    data: applications,
    isLoading,
    error: applicationsError,
    refetch: refetchApplications,
  } = useApplications();

  const header = (
    <h3 className="text-2xl font-normal capitalize text-accent-primary md:mb-6">
      Applications
    </h3>
  );

  if (applicationsError) {
    return (
      <>
        {header}
        <SubSection className="flex flex-col items-center gap-4 py-8">
          <Text variant="body1" className="text-error">
            Failed to load applications
          </Text>
          <Text variant="body2" className="text-accent-secondary">
            {applicationsError.message ||
              "Unable to fetch data. Please try again."}
          </Text>
          <Button
            variant="outlined"
            rounded
            onClick={() => {
              refetchApplications();
            }}
          >
            Try Again
          </Button>
        </SubSection>
      </>
    );
  }

  if (!applications || applications.length === 0) {
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
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-1">
        {applications.map((app) => {
          const appId = getAppIdByController(app.id);
          const isAave = appId === "aave";

          // Render custom Aave banner
          if (isAave) {
            return (
              <AaveBanner
                key={app.id}
                onExplore={() => navigate(`/app/${appId}`)}
              />
            );
          }

          // Render standard card for other applications
          return (
            <SubSection
              key={app.id}
              className="flex flex-col gap-6 transition-all hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <ApplicationLogo
                    logoUrl={app.logoUrl}
                    name={app.name || app.type}
                    size="small"
                    shape="rounded"
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

              {app.websiteUrl && (
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
              )}
            </SubSection>
          );
        })}
      </div>
    </>
  );
}
