import {
  QueryClient,
  createProtobufRpcClient,
  setupBankExtension,
  setupDistributionExtension,
  setupStakingExtension,
} from "@cosmjs/stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";

import * as btclightclientquery from "../../generated/babylon/btclightclient/v1/query";
import * as incentivequery from "../../generated/babylon/incentive/query";

import createBTCClient from "./btc";
import createBabylonClient from "./baby";

const createClient = async ({ rpcUrl }: any) => {
  const tmClient = await Tendermint34Client.connect(rpcUrl);
  const queryClient = QueryClient.withExtensions(
    tmClient,
    setupBankExtension,
    setupStakingExtension,
    setupDistributionExtension,
  );
  const rpc = createProtobufRpcClient(queryClient);

  const incentive = new incentivequery.QueryClientImpl(rpc);
  const btcLight = new btclightclientquery.QueryClientImpl(rpc);
  const bank = setupBankExtension(queryClient).bank;
  const staking = setupStakingExtension(queryClient).staking;
  const distribution = setupDistributionExtension(queryClient).distribution;

  return {
    baby: createBabylonClient({ staking, distribution, bank }),
    btc: createBTCClient({ incentive, btcLight })
  }
}

export default createClient;