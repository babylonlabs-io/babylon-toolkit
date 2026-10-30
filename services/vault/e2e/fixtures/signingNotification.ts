import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { SigningNotificationProvider } from "../../src/context/SigningNotificationContext";
import { useDepositSigningNotification } from "../../src/hooks/deposit/useDepositSigningNotification";

type Step = Parameters<typeof useDepositSigningNotification>;
const root = createRoot(
  document.body.appendChild(document.createElement("div")),
);
function Observer({ step }: { step: Step }) {
  useDepositSigningNotification(...step);
  return null;
}
export function render(step: Step) {
  flushSync(() =>
    root.render(
      createElement(
        SigningNotificationProvider,
        null,
        createElement(Observer, { step }),
      ),
    ),
  );
}
