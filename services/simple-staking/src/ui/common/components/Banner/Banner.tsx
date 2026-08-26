import { TestingBanner } from "@babylonlabs-io/core-ui";

import { shouldDisplayTestingMsg } from "@/ui/common/config";

export const Banner = () => {
  return <TestingBanner visible={shouldDisplayTestingMsg()} />;
};
