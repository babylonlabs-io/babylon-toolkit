import { Text } from "@babylonlabs-io/core-ui";
import { IoCheckmarkSharp } from "react-icons/io5";

interface CompletedStepsPillProps {
  completed: number;
  total: number;
}

export function CompletedStepsPill({
  completed,
  total,
}: CompletedStepsPillProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-success-main/10 p-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-success-light">
        <IoCheckmarkSharp size={16} className="text-success-light" />
      </div>
      <Text as="span" variant="body2" className="text-success-light">
        {completed} of {total} steps completed
      </Text>
    </div>
  );
}
