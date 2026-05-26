import { Popover } from "@babylonlabs-io/core-ui";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";
import { useRef, useState } from "react";

export interface FilterDropdownOption<V extends string> {
  value: V;
  label: string;
}

interface FilterDropdownProps<V extends string> {
  value: V;
  options: ReadonlyArray<FilterDropdownOption<V>>;
  onChange: (value: V) => void;
}

export function FilterDropdown<V extends string>({
  value,
  options,
  onChange,
}: FilterDropdownProps<V>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const activeLabel =
    options.find((option) => option.value === value)?.label ?? "";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[8px] border border-stroke-primary px-4 py-2 text-[14px] text-accent-primary"
      >
        <span>{activeLabel}</span>
        <RiArrowDownSLine size={20} />
      </button>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        offset={[0, 8]}
        onClickOutside={() => setOpen(false)}
        className="w-[200px] rounded-[8px] bg-background-contrast p-4 shadow-[0px_8px_8px_rgba(0,0,0,0.12)]"
      >
        <ul role="listbox" className="flex flex-col gap-4">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between text-[14px] text-accent-primary"
              >
                <span>{option.label}</span>
                {selected && <RiCheckLine size={20} />}
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
