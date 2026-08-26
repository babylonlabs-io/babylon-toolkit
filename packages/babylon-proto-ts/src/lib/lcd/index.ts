import { createRequest } from "../utils/http";
import createBabylonClient from "./baby";
import createBTCClient from "./btc";

const createLCDClient = ({ url }: { url: string }) => {
  const request = createRequest(url);

  return {
    baby: createBabylonClient({ request }),
    btc: createBTCClient({ request }),
  };
};

export default createLCDClient;
