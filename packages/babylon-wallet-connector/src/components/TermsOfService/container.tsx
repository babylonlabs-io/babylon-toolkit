import { useWidgetState } from "@/hooks/useWidgetState";

import { TermsOfService } from ".";

export interface TermsOfServiceContainerProps {
  className?: string;
  onClose?: () => void;
  onSubmit?: () => void;
}

export function TermsOfServiceContainer(props: TermsOfServiceContainerProps) {
  const { chains } = useWidgetState();

  return <TermsOfService {...props} config={chains.BTC?.config} />;
}
