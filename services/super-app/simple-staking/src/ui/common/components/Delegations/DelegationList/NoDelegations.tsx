import { Heading } from "@babylonlabs-io/core-ui";
import { IoEye } from "react-icons/io5";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

const { networkFullName: bbnNetworkFullName } = getNetworkConfigBBN();

export const NoDelegations = () => (
  <div className="flex flex-col items-center justify-center gap-4 pb-16 pt-6 text-center text-accent-primary">
    <div className="flex h-20 w-20 items-center justify-center bg-primary-contrast">
      <IoEye className="text-5xl text-primary-light" />
    </div>
    <Heading variant="h4">No {bbnNetworkFullName} Stakes</Heading>
    <p className="text-base">
      This is where your registered stakes will be displayed.
    </p>
  </div>
);
