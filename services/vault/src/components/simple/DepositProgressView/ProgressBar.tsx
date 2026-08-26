interface ProgressBarProps {
  percent: number;
  /** Explicit fill color (any CSS color). Defaults to the success (green) fill
   * used by the in-flow stepper; pending deposit cards pass the asset color. */
  color?: string;
}

export function ProgressBar({ percent, color }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, percent));
  // When no explicit color is given, fall back to the green success fill class.
  const fillClassName = color
    ? "h-full transition-[width] duration-300"
    : "h-full bg-success-light transition-[width] duration-300";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className="h-1 w-full overflow-hidden rounded-full bg-secondary-strokeLight"
    >
      <div
        className={fillClassName}
        style={{
          width: `${clamped * 100}%`,
          ...(color ? { backgroundColor: color } : {}),
        }}
      />
    </div>
  );
}
