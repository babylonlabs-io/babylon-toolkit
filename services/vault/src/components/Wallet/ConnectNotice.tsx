import { LEGAL_LINK_URLS } from "@/config/socialLinks";
import { COPY } from "@/copy";

const LINK_CLASS = "text-accent-primary underline";

export function ConnectNotice() {
  return (
    <>
      {COPY.wallet.connectNotice.beforeTerms}
      <a
        href={LEGAL_LINK_URLS.termsOfUse}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {COPY.nav.termsOfUse}
      </a>
      {COPY.wallet.connectNotice.betweenLinks}
      <a
        href={LEGAL_LINK_URLS.privacyPolicy}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {COPY.nav.privacyPolicy}
      </a>
      {COPY.wallet.connectNotice.after}
    </>
  );
}
