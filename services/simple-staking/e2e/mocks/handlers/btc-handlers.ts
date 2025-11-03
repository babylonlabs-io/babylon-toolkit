import { http, HttpResponse } from "msw";

import { MOCK_VALUES } from "./constants";

export const btcHandlers = [
  // Mempool API handlers
  http.get("*/api/address/*/utxo", () => {
    const response = [
      {
        txid: "txid1",
        vout: 0,
        value: Number.parseInt(MOCK_VALUES.STAKABLE_BTC),
        status: {
          confirmed: true,
        },
      },
    ];
    return HttpResponse.json(response);
  }),

  http.get("*/api/v1/validate-address/*", () => {
    return HttpResponse.json({
      isvalid: true,
      scriptPubKey: "0014abcdef1234567890abcdef1234567890abcdef12",
    });
  }),

  http.get("*/api/address/*", () => {
    return HttpResponse.json({
      chain_stats: {
        funded_txo_sum: Number.parseInt(MOCK_VALUES.STAKABLE_BTC),
        spent_txo_sum: 0,
      },
    });
  }),
];
