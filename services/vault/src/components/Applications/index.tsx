import { Button, Chip, SubSection } from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import { useMarkets } from "../../hooks/morpho";
import { useApplications } from "../../hooks/useApplications";
import { ApplicationLogo } from "../ApplicationLogo";

export function Applications() {
  const navigate = useNavigate();
  const { data: applications, isLoading, error } = useApplications();
  const { markets } = useMarkets();

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

            {/* For Morpho (Lending type), navigate to first market if available */}
            {/* Note: Currently assumes single market (vBTC/USDC). Update when multiple markets are supported. */}
            {app.type === "Lending" && markets.length > 0 ? (
              <Button
                variant="outlined"
                rounded
                className="self-start"
                onClick={() => navigate(`/market/${markets[0].id}`)}
              >
                Explore
              </Button>
            ) : (
              app.websiteUrl && (
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
              )
            )}
          </SubSection>
        ))}
      </div>
    </>
  );
}
