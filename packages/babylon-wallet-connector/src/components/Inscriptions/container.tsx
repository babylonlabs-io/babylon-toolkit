import { useWidgetState } from "@/hooks/useWidgetState";

import { Inscriptions } from ".";

interface InscriptionsContainerProps {
  className?: string;
  onSubmit?: (value: boolean, showAgain: boolean) => void;
}

export function InscriptionsContainer({ className, onSubmit }: InscriptionsContainerProps) {
  const { chains } = useWidgetState();

  return <Inscriptions className={className} onSubmit={onSubmit} config={chains.BTC?.config} />;
}
