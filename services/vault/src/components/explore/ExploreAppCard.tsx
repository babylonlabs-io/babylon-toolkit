import { Button } from "@babylonlabs-io/core-ui";

import { CARD_SHELL_CLASS } from "@/components/shared/layoutClasses";
import type { ExploreApp } from "@/config/exploreApps";
import { COPY } from "@/copy";

interface ExploreAppCardProps {
  app: ExploreApp;
}

// The logo tile background from Figma (`accent/beige`). Kept as an arbitrary
// value like the existing card surface (`dark:bg-[#202020]` in
// CARD_SHELL_CLASS) since there is no theme token for it.
const LOGO_TILE_CLASS =
  "flex size-[110px] shrink-0 items-center justify-center rounded-lg bg-[#fceade]";

/**
 * A single Explore entry: logo tile, name + description, and a "Go to App"
 * button that opens the external destination in a new tab. core-ui's Button
 * renders a native <button> with no href, and interactive content can't nest
 * inside an <a>, so navigation goes through window.open with `noopener` (the
 * same pattern used by the refund-success screen).
 */
export function ExploreAppCard({ app }: ExploreAppCardProps) {
  return (
    <div className={`${CARD_SHELL_CLASS} p-4`} data-testid="explore-app-card">
      <div className="flex h-full gap-6">
        <div className={LOGO_TILE_CLASS}>
          <img
            src={app.logoUrl}
            alt={`${app.name} logo`}
            className="size-[66px] object-contain"
          />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl text-accent-primary">{app.name}</h3>
            <p className="text-xs leading-relaxed text-accent-secondary">
              {app.description}
            </p>
          </div>

          <div className="mt-auto pt-4">
            <Button
              fluid
              variant="contained"
              color="secondary"
              size="small"
              onClick={() =>
                window.open(app.appUrl, "_blank", "noopener,noreferrer")
              }
              data-testid="explore-go-to-app"
            >
              {COPY.explore.goToApp}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
