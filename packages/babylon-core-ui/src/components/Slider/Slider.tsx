import { useMemo } from "react";
import { twJoin } from "tailwind-merge";
import "./Slider.css";

export interface SliderStep {
  value: number;
  label?: string;
}

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  steps?: SliderStep[];
  onChange: (value: number) => void;
  variant?: "primary" | "success" | "warning" | "error" | "rainbow";
  activeColor?: string;
  className?: string;
  disabled?: boolean;
  showFill?: boolean;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  steps,
  onChange,
  variant = "primary",
  activeColor,
  className,
  disabled = false,
  showFill = true,
}: SliderProps) {
  const fillPercentage = useMemo(() => {
    return ((value - min) / (max - min)) * 100;
  }, [value, min, max]);

  const handleChange = (newValue: number) => {
    if (steps && steps.length > 0) {
      // Find nearest step and snap to it
      const nearest = steps.reduce((prev, curr) => {
        return Math.abs(curr.value - newValue) < Math.abs(prev.value - newValue)
          ? curr
          : prev;
      });
      onChange(nearest.value);
    } else {
      onChange(newValue);
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        disabled={disabled}
        className={twJoin(
          "bbn-slider",
          `bbn-slider-${variant}`,
          showFill && "bbn-slider-filled",
          disabled && "bbn-slider-disabled",
          className
        )}
        style={{
          "--slider-fill": `${fillPercentage}%`,
          "--slider-active-color": activeColor,
        } as React.CSSProperties}
      />
      
      {/* Rainbow mask overlay - shows stroke-dark for unreached portions */}
      {variant === "rainbow" && (
        <div 
          className="absolute top-0 h-2 rounded-lg pointer-events-none"
          style={{
            left: `${fillPercentage}%`,
            right: 0,
            backgroundColor: 'var(--unfilled-color)',
          }}
        />
      )}
      
      {/* Step Markers - only show if explicitly provided via steps prop */}
      {steps && steps.length > 0 && (
        <div className="absolute top-0 left-0 right-0 h-2 flex items-center pointer-events-none">
          {steps.map((stepItem, index) => {
            const position = ((stepItem.value - min) / (max - min)) * 100;
            const isReached = stepItem.value <= value;
            return (
              <div
                key={index}
                className={twJoin(
                  "absolute w-2 h-2 bg-white border-2 border-surface-secondary rounded-full -translate-x-1/2",
                  !isReached && "opacity-50"
                )}
                style={{ left: `${position}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
