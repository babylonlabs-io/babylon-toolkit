import { Container } from "@babylonlabs-io/core-ui";

import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import {
  NotificationCard,
  type NotificationCardTone,
} from "@/components/shared/NotificationCard";
import {
  type ProtocolStatus,
  resolveBannerStatus,
} from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { useProtocolStatusOverride } from "@/overrides/protocolStatus";

// tone per status — exhaustive over ProtocolStatus so a new ScopeStatus fails
// the typecheck instead of silently falling through.
const STATUS_TONE: Record<ProtocolStatus, NotificationCardTone> = {
  frozen: "soft-paused",
  paused: "fully-paused",
};

/**
 * Protocol governance-status banner (frozen / paused). Renders nothing unless a
 * status flag is set. DevOps can override the body text per incident via
 * NEXT_PUBLIC_NOTICE_BANNER_MESSAGE; otherwise the default per-status copy
 * shows.
 */
export function ProtocolStatusBanner() {
  const gate = useProtocolGateState();
  // Dev-only god-mode override (compile-time null in production, see
  // overrides/protocolStatus) — forcing "healthy" is not a scenario, so
  // releasing the override (null) is how you go back to the live gate state.
  const statusOverride = useProtocolStatusOverride();
  const status = statusOverride ?? resolveBannerStatus(gate);
  if (!status) {
    return null;
  }

  const v3 = COPY.protocolStatusV3[status];
  const body = featureFlags.noticeBannerMessage ?? v3.body;

  // Same Container the page sections use, so the card aligns to the content
  // column width instead of overshooting it.
  return (
    <Container className={`${PAGE_CONTENT_CLASS} py-6`}>
      <NotificationCard
        tone={STATUS_TONE[status]}
        title={v3.title}
        data-testid="protocol-status-banner"
      >
        {body}
      </NotificationCard>
    </Container>
  );
}
