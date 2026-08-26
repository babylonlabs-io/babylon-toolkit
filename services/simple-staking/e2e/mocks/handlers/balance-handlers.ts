import { http, HttpResponse } from "msw";

import { MOCK_VALUES } from "./constants";

export const balanceHandlers = [
  http.get("/v2/balances*", () => {
    const response = {
      balance: {
        bbn: MOCK_VALUES.BBN_BALANCE,
        stakable_btc: MOCK_VALUES.STAKABLE_BTC,
      },
    };
    return HttpResponse.json(response);
  }),

  http.get("/v2/staked*", () => {
    const response = {
      staked: {
        btc: MOCK_VALUES.STAKED_BTC,
        delegated_btc: MOCK_VALUES.STAKED_BTC,
      },
    };
    return HttpResponse.json(response);
  }),

  http.get("/v2/stakable-btc*", () => {
    const response = {
      balance: MOCK_VALUES.STAKABLE_BTC,
    };
    return HttpResponse.json(response);
  }),

  http.get("/v2/rewards*", () => {
    const response = {
      rewards: MOCK_VALUES.REWARDS,
    };
    return HttpResponse.json(response);
  }),
];
