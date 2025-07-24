import { AiOutlinePlus } from "react-icons/ai";
import { twJoin } from "tailwind-merge";

interface CounterButtonProps {
  counter: number;
  max: number;
  alwaysShowCounter?: boolean;
  onAdd: () => void;
}

export function CounterButton({ counter, max, onAdd, alwaysShowCounter = false }: CounterButtonProps) {
  const isClickable = counter < max;
  const showsCounter = (0 < counter) || (alwaysShowCounter && counter === 0);

  return (
    <div
      className={twJoin(
        "bg-primary-highlight flex overflow-hidden rounded-md border border-accent-primary w-fit",
        isClickable && "cursor-pointer",
        !showsCounter && !isClickable && "hidden",
        !showsCounter && "w-10",
      )}
      onClick={isClickable ? onAdd : undefined}
    >
      {isClickable && (
        <div className="flex h-10 w-10 items-center justify-center">
          <AiOutlinePlus size={20} />
        </div>
      )}
      {showsCounter && (
        <div className={twJoin(
          "flex h-10 items-center px-2 text-sm sm:px-4 sm:text-base",
          isClickable && "border-l border-accent-primary"
        )}>
          {counter}/{max}
        </div>
      )}
    </div>
  );
}
