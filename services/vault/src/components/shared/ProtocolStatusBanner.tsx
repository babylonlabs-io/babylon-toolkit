import {
  Container,
  Notification,
  type NotificationVariant,
} from "@babylonlabs-io/core-ui";

import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import {
  type ProtocolStatus,
  resolveBannerStatus,
} from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

// TODO: swap for the confirmed protocol-status docs URL once product provides
// it. Until then, enabling the freeze/pause flags in an environment should be
// gated on the real URL being set.
const PROTOCOL_STATUS_LEARN_MORE_URL = "https://docs.babylonlabs.io";

// frozen = teal/info-light (you can still act); paused = red/error-light (full
// stop). The core-ui variant names ("paused"/"halted") are visual styles, kept
// as-is — only the protocol-status naming changed.
const STATUS_VARIANT: Record<ProtocolStatus, NotificationVariant> = {
  frozen: "paused",
  paused: "halted",
};

/**
 * Protocol governance-status banner (frozen / paused). Renders nothing unless a
 * status flag is set. DevOps can override the body text per incident via
 * NEXT_PUBLIC_PROTOCOL_STATUS_MESSAGE; otherwise the default per-status copy
 * shows.
 */
export function ProtocolStatusBanner() {
  const gate = useProtocolGateState();
  const status = resolveBannerStatus(gate);
  if (!status) {
    return null;
  }

  const copy = COPY.protocolStatus[status];
  const body = featureFlags.protocolStatusMessage ?? copy.body;

  // Same Container the page sections use, so the card aligns to the content
  // column width instead of overshooting it.
  return (
    <Container className={`${PAGE_CONTENT_CLASS} py-6`}>
      <Notification
        variant={STATUS_VARIANT[status]}
        title={copy.title}
        data-testid="protocol-status-banner"
      >
        {body}{" "}
        <a
          href={PROTOCOL_STATUS_LEARN_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-primary underline"
        >
          {copy.learnMore}
        </a>
      </Notification>
    </Container>
  );
}
