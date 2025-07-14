import { createBabylonClient } from "./client";
import messages from "./messages";
import utils from "./utils";

interface BabylonConfig {
  rpcUrl: string;
}

export const createBabylonSDK = ({ rpcUrl }: BabylonConfig) => {
  const client = createBabylonClient(rpcUrl);

  return {
    connect: () => client.connect(),
    client,
    messages,
    utils,
  };
};
