import "@/config/env";

import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { InsufficientFundsError, parseEther } from "viem";

import { DepositProgressView } from "@/components/simple/DepositProgressView/DepositProgressView";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import Providers from "@/providers";
import { mapDepositError } from "@/utils/errors/depositErrors";

import "@/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("The render fixture needs its root element.");

// Required fee and available balance from the deposit failure in #2888.
const error = mapDepositError(
  Object.assign(new InsufficientFundsError(), {
    required: parseEther("0.01487") + 1n,
    balance: parseEther("0.00277"),
  }),
);

createRoot(root).render(
  <BrowserRouter>
    <Providers>
      <ProtocolParamsProvider>
        <FullScreenDialog open className="items-center justify-center p-4">
          <DepositProgressView
            currentStep={DepositFlowStep.SUBMIT_PEGIN}
            error={error}
            isComplete={false}
            isProcessing={false}
            canClose
            canContinueInBackground={false}
            payoutSigningProgress={null}
            peginSigningProgress={null}
            onClose={() => {
              root.dataset.closed = "true";
            }}
            onRetry={() => {
              root.dataset.retried = "true";
            }}
          />
        </FullScreenDialog>
      </ProtocolParamsProvider>
    </Providers>
  </BrowserRouter>,
);
