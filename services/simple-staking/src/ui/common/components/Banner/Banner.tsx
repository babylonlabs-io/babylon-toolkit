import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

import { shouldDisplayTestingMsg } from "@/ui/common/config";

export const Banner = () => {
  if (!shouldDisplayTestingMsg()) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-between gap-2 bg-[#D5FCE8] px-4 py-3 text-primary-main">
      <div className="flex flex-row items-center gap-2">
        <PiWarningOctagonFill />
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
