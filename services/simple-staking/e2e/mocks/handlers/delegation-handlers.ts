import { http, HttpResponse } from "msw";

import { mockDelegation, mockNetworkInfo } from "./constants";

export const delegationHandlers = [
  http.get("/v1/staker/delegations*", () => {
    return HttpResponse.json({
      data: [],
      pagination: { next_key: null, total: "0" },
    });
  }),

  http.get("/v2/delegations*", () => {
    return HttpResponse.json({
      data: [mockDelegation],
      pagination: { next_key: "", total: "1" },
    });
  }),

  http.get("/v2/network-info*", () => {
    return HttpResponse.json(mockNetworkInfo);
  }),
];
