/**
 * Explore — the v3 /explore route (issue #2143).
 *
 * A browse/discover grid of partner apps and integrations built around
 * Bitcoin-backed liquidity. Backed by the static `useExploreApps()` registry
 * today; the page is structured (loading / empty / populated) so a later swap
 * to fetched data needs no change here.
 */

import { Container, Loader } from "@babylonlabs-io/core-ui";

import { ExploreAppCard } from "@/components/explore/ExploreAppCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { COPY } from "@/copy";
import { useExploreApps } from "@/hooks/useExploreApps";

export default function Explore() {
  const { apps, isLoading } = useExploreApps();

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader />
        </div>
      );
    }

    if (!apps.length) {
      return (
        <EmptyState
          variant="v3"
          withCard
          title={COPY.explore.empty.title}
          description={COPY.explore.empty.description}
        />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <ExploreAppCard key={app.id} app={app} />
        ))}
      </div>
    );
  };

  return (
    <Container as="main" className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="flex flex-col gap-8">
        <p className="text-accent-secondary">{COPY.explore.subtitle}</p>
        {renderBody()}
      </div>
    </Container>
  );
}
