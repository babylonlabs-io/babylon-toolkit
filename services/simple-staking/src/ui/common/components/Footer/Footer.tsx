import {
  Footer as CoreFooter,
  DEFAULT_SOCIAL_LINKS,
} from "@babylonlabs-io/core-ui";

export const Footer = () => {
  return <CoreFooter socialLinks={DEFAULT_SOCIAL_LINKS} copyrightYear={2025} />;
};
