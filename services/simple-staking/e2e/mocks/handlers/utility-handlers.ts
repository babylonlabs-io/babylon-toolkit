import { http, HttpResponse } from "msw";

export const utilityHandlers = [
  http.get("/address/screening*", () => {
    return HttpResponse.json({
      data: {
        btc_address: {
          risk: "low",
        },
      },
    });
  }),
];
