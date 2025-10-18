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
  steps?: SliderStep[] | number;
  maxStepCount?: number;
  onChange: (value: number) => void;
  onStepsChange?: (selectedSteps: number[]) => void; // Called when steps is array - returns cumulative selection
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
  maxStepCount = 10,
  onChange,
  onStepsChange,
  variant = "primary",
  activeColor,
  className,
  disabled = false,
  showFill = true,
}: SliderProps) {
  const fillPercentage = useMemo(() => {
    return ((value - min) / (max - min)) * 100;
  }, [value, min, max]);

  const isArrayMode = useMemo(() => {
    return Array.isArray(steps);
  }, [steps]);

  const computedSteps = useMemo(() => {
    if (!steps) return undefined;
    
    if (typeof steps === 'number') {
      // Generate evenly distributed steps
      const count = Math.min(steps, maxStepCount);
      const stepSize = (max - min) / (count - 1);
      return Array.from({ length: count }, (_, i) => ({
        value: min + (stepSize * i)
      }));
    }
    
    // Array provided - use actual values
    return steps.slice(0, maxStepCount);
  }, [steps, min, max, maxStepCount]);

  // For rendering dots - exclude first and last
  const visibleSteps = useMemo(() => {
    if (!computedSteps || computedSteps.length <= 2) return [];
    return computedSteps.slice(1, -1); // Remove first and last
  }, [computedSteps]);

  // Generate CSS background pattern for step dots (excluding first and last)
  const stepDotsBackground = useMemo(() => {
    if (!visibleSteps || visibleSteps.length === 0) return '';
    
    const dots = visibleSteps.map((stepItem) => {
      const position = ((stepItem.value - min) / (max - min)) * 100;
      return `radial-gradient(circle at ${position}% center, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.4) 4px, transparent 4px)`;
    });
    
    return dots.join(', ');
  }, [visibleSteps, min, max]);

  const handleChange = (newValue: number) => {
    if (computedSteps && computedSteps.length > 0) {
      // Find nearest step and snap to it
      const nearest = computedSteps.reduce((prev, curr) => {
        return Math.abs(curr.value - newValue) < Math.abs(prev.value - newValue)
          ? curr
          : prev;
      });
      onChange(nearest.value);
      
      // Array mode: call onStepsChange with cumulative selection
      if (isArrayMode && onStepsChange && computedSteps) {
        const currentIndex = computedSteps.findIndex(s => s.value === nearest.value);
        if (currentIndex !== -1) {
          // Return all steps from beginning up to and including current
          const selectedSteps = computedSteps
            .slice(0, currentIndex + 1)
            .map(s => s.value);
          onStepsChange(selectedSteps);
        }
      }
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
          visibleSteps && visibleSteps.length > 0 && "bbn-slider-with-steps",
          className
        )}
        style={{
          "--slider-fill": `${fillPercentage}%`,
          "--slider-active-color": activeColor,
          "--step-dots-background": stepDotsBackground,
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
    </div>
  );
}
