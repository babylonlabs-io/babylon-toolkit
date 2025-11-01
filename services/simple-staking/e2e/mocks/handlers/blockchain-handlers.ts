import { incentivequery } from "@babylonlabs-io/babylon-proto-ts";
import { QueryBalanceResponse } from "cosmjs-types/cosmos/bank/v1beta1/query.js";
import { http, HttpResponse, type HttpHandler } from "msw";

import { MOCK_VALUES } from "./constants";

type QueryHandler = ({ request }: { request: Request }) => Response;

interface QueryStrategy {
  pattern: RegExp | string;
  handler: QueryHandler;
}

const handleRewardGauges: QueryHandler = ({ request }) => {
  try {
    const mockResponse = incentivequery.QueryRewardGaugesResponse.fromPartial({
      rewardGauges: {
        BTC_STAKER: {
          coins: [{ amount: MOCK_VALUES.REWARDS, denom: "ubbn" }],
          withdrawnCoins: [],
        },
      },
    });

    const encoded =
      incentivequery.QueryRewardGaugesResponse.encode(mockResponse).finish();

    const base64Value = Buffer.from(encoded).toString("base64");

    return HttpResponse.json({
      jsonrpc: "2.0",
      id: -1,
      result: {
        response: {
          code: 0,
          log: "",
          info: "",
          index: "0",
          key: null,
          value: base64Value,
          proof_ops: null,
          height: "0",
          codespace: "",
        },
      },
    });
  } catch (error) {
    console.error("Failed to build mock RewardGauges response", error);
    return fetch(request);
  }
};

const handleBankBalance: QueryHandler = ({ request }) => {
  try {
    const mockResp = QueryBalanceResponse.fromPartial({
      balance: { denom: "ubbn", amount: MOCK_VALUES.BBN_BALANCE },
    });

    const encoded = QueryBalanceResponse.encode(mockResp).finish();
    const base64Value = Buffer.from(encoded).toString("base64");

    return HttpResponse.json({
      jsonrpc: "2.0",
      id: -1,
      result: {
        response: {
          code: 0,
          log: "",
          info: "",
          index: "0",
          key: null,
          value: base64Value,
          proof_ops: null,
          height: "0",
          codespace: "",
        },
      },
    });
  } catch (error) {
    console.error("Failed to build mock Bank Balance response", error);
    return fetch(request);
  }
};

const queryStrategies: QueryStrategy[] = [
  {
    pattern:
      /(babylon\.incentive\.v1\.Query\/RewardGauges|babylon\.incentive\.Query\/RewardGauges)/,
    handler: handleRewardGauges,
  },
  {
    pattern: /cosmos\.bank\.v1beta1\.Query\/Balance/,
    handler: handleBankBalance,
  },
];

export const blockchainHandlers = [
  http.get(/.*\/abci_query$/, ({ request }) => {
    const url = new URL(request.url);
    let pathParam = url.searchParams.get("path");

    if (pathParam) {
      if (pathParam.startsWith("%22") || pathParam.startsWith('"')) {
        try {
          pathParam = decodeURIComponent(pathParam);
        } catch (_) {}
        pathParam = pathParam.replace(/^\"|\"$/g, "");
      }
    }

    if (pathParam) {
      for (const strategy of queryStrategies) {
        if (
          typeof strategy.pattern === "string"
            ? pathParam.includes(strategy.pattern)
            : strategy.pattern.test(pathParam)
        ) {
          return strategy.handler({ request });
        }
      }
    }

    return fetch(request);
  }),
];
