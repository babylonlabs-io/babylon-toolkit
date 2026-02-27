import { InfoIcon } from "./icons";

interface LabelWithInfoProps {
  children: React.ReactNode;
}

export function LabelWithInfo({ children }: LabelWithInfoProps) {
  return (
    <span className="flex items-center gap-2">
      {children}
      <InfoIcon />
    </span>
  );
}
