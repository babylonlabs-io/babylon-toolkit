import { createRequest } from "../utils/http";
import createBabylonClient from "./baby";
import createBTCClient from "./btc";

const createLCDClient = ({ lcdClient }: { lcdClient: string }) => {
  const request = createRequest(lcdClient);

  return {
    baby: createBabylonClient({ request }),
    btc: createBTCClient({ request }),
  };
};

export default createLCDClient;
