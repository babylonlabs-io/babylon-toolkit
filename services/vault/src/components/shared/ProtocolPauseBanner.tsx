import {
  Container,
  Notification,
  type NotificationVariant,
} from "@babylonlabs-io/core-ui";

import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import {
  type ProtocolPauseLevel,
  resolveProtocolPauseLevel,
} from "@/components/shared/protocolPauseLevel";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";

// TODO(#1953): swap for the confirmed protocol-pause docs URL once product
// provides it.
const PROTOCOL_PAUSE_LEARN_MORE_URL = "https://docs.babylonlabs.io";

// Soft = teal/info-light (you can still act); hard = red/error-light (full stop).
const LEVEL_VARIANT: Record<ProtocolPauseLevel, NotificationVariant> = {
  soft: "paused",
  hard: "halted",
};

/**
 * Protocol-pause status banner (soft / fully paused). Renders nothing unless a
 * pause flag is set. DevOps can override the body text per incident via
 * NEXT_PUBLIC_PAUSE_BANNER_MESSAGE; otherwise the default per-level copy shows.
 */
export function ProtocolPauseBanner() {
  const level = resolveProtocolPauseLevel();
  if (!level) {
    return null;
  }

  const copy = COPY.protocolPause[level];
  const body = featureFlags.pauseBannerMessage ?? copy.body;

  // Same Container the page sections use, so the card aligns to the content
  // column width instead of overshooting it.
  return (
    <Container className={`${PAGE_CONTENT_CLASS} py-6`}>
      <Notification
        variant={LEVEL_VARIANT[level]}
        title={copy.title}
        data-testid="protocol-pause-banner"
      >
        {body}{" "}
        <a
          href={PROTOCOL_PAUSE_LEARN_MORE_URL}
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
