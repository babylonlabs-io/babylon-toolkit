/**
 * The activity toolbar's search box. A plain input rather than core-ui's
 * `Input`: that one bakes its radius, fill and border into a `.bbn-input` rule
 * whose utilities this design would have to fight, and no other surface needs
 * this variant.
 */

import { RiSearchLine } from "react-icons/ri";

import { COPY } from "@/copy";

const SEARCH_ICON_SIZE = 18;

interface ActivitySearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ActivitySearchInput({
  value,
  onChange,
}: ActivitySearchInputProps) {
  return (
    <label className="flex w-full max-w-[360px] items-center gap-2 rounded-lg border border-secondary-strokeLight bg-primary-contrast py-2 pl-4 pr-3 dark:bg-transparent">
      <RiSearchLine
        size={SEARCH_ICON_SIZE}
        aria-hidden
        className="shrink-0 text-accent-secondary"
      />
      <input
        type="search"
        value={value}
        aria-label={COPY.activity.searchLabel}
        placeholder={COPY.activity.searchPlaceholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-sm leading-[1.43] tracking-[0.17px] text-accent-primary outline-none placeholder:text-accent-disabled"
      />
    </label>
  );
}
