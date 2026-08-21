import { panelSegmentClass } from "../panelChrome";

/** Equal-width segmented-control button (theme, protocol status, cascade
 *  mode, presets, …) — shared by every panel that needs one. */
export function SegmentButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={panelSegmentClass(active)}
    >
      {label}
    </button>
  );
}
