import { PiWarningOctagonFill } from "react-icons/pi";

import { Text } from "../Text";

import "./TestingBanner.css";

export interface TestingBannerProps {
  visible: boolean;
}

export const TestingBanner = ({ visible }: TestingBannerProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="bbn-testing-banner">
      <div className="bbn-testing-banner-content">
        <PiWarningOctagonFill className="bbn-testing-banner-icon" />
        <Text variant="body1">
          <strong>This is a testing app</strong>
          <br />
          The app may contain bugs. Use it after conducting your own research
          and making an informed decision. Tokens are for testing only and do
          not carry any monetary value and the testnet is not incentivized.
        </Text>
      </div>
    </div>
  );
};

