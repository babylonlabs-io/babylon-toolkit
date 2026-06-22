import { Callout } from "@babylonlabs-io/core-ui";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import {
  type DepositWarning,
  isDepositWarningResolved,
} from "@/hooks/deposit/depositWarnings";

interface ContinuationWarningsProps {
  warnings: DepositWarning[];
}

/**
 * Renders the deposit-flow soft warnings that are still relevant during the
 * post-deposit continuation phase. A non-terminal per-vault warning is dropped
 * once its vault's live `PeginState` shows it advanced past the warned stage
 * (see {@link isDepositWarningResolved}); terminal and global warnings always
 * show. Must render inside the continuation's `PeginPollingProvider` so it can
 * read live per-vault state.
 */
export function ContinuationWarnings({ warnings }: ContinuationWarningsProps) {
  const { getPollingResult } = usePeginPolling();
  const visible = warnings.filter(
    (warning) =>
      !isDepositWarningResolved(
        warning,
        warning.vaultId
          ? getPollingResult(warning.vaultId)?.peginState
          : undefined,
      ),
  );
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((warning) => (
        <Callout
          key={`${warning.vaultId ?? "global"}:${warning.stage}`}
          variant="warning"
        >
          {warning.message}
        </Callout>
      ))}
    </>
  );
}
