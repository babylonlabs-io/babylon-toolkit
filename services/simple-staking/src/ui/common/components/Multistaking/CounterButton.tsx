import { AiOutlinePlus } from "react-icons/ai";
import { twJoin } from "tailwind-merge";

interface CounterButtonProps {
  counter: number;
  max: number;
  onAdd: () => void;
  alwaysShowCounter?: boolean;
}

export function CounterButton({
  counter,
  max,
  onAdd,
  alwaysShowCounter = false,
}: CounterButtonProps) {
  const isClickable = counter < max;
  const hasActiveCounter = counter > 0 && max > 1;
  const showsInitialCounter = alwaysShowCounter && counter === 0;
  const showsCounter = hasActiveCounter || showsInitialCounter;

  if (!showsCounter && !isClickable) {
    return null;
  }

  return (
    <div
      className={twJoin(
        "bg-primary-highlight flex overflow-hidden rounded-md border border-accent-primary",
        isClickable && "cursor-pointer",
      )}
      onClick={isClickable ? onAdd : undefined}
    >
      {isClickable && (
        <div className="flex h-10 w-10 items-center justify-center">
          <AiOutlinePlus size={20} />
        </div>
      )}
      {showsCounter && (
        <div className="flex h-10 items-center border-l border-accent-primary px-2 text-sm sm:px-4 sm:text-base">
          {counter}/{max}
        </div>
      )}
    </div>
  );
}
