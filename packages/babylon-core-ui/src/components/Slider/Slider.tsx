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

  const computedSteps = useMemo(() => {
    if (typeof steps === 'number') {
      // Generate evenly distributed steps (including max, but we'll filter it out later)
      const count = Math.min(steps, maxStepCount);
      const stepSize = (max - min) / (count - 1);
      return Array.from({ length: count }, (_, i) => ({
        value: min + (stepSize * i)
      }));
    }
    
    if (Array.isArray(steps)) {
      // Array provided - use actual values
      return steps.slice(0, maxStepCount);
    }
    
    // No steps provided - generate 5 default steps evenly distributed (not including max)
    const defaultStepCount = 5;
    const stepSize = (max - min) / defaultStepCount;
    return Array.from({ length: defaultStepCount }, (_, i) => ({
      value: min + (stepSize * i)
    }));
  }, [steps, min, max, maxStepCount, step]);

  // For rendering dots - filter out steps at min and max values
  const visibleSteps = useMemo(() => {
    if (!computedSteps) return [];
    return computedSteps.filter(step => step.value > min && step.value < max);
  }, [computedSteps, min, max]);

  // Calculate the actual step size to use for the input element
  const inputStep = useMemo(() => {
    if (Array.isArray(steps) && computedSteps && computedSteps.length > 1) {
      // Find the minimum difference between consecutive steps
      const stepValues = computedSteps.map(s => s.value).sort((a, b) => a - b);
      let minDiff = Infinity;
      for (let i = 1; i < stepValues.length; i++) {
        const diff = stepValues[i] - stepValues[i - 1];
        if (diff > 0 && diff < minDiff) {
          minDiff = diff;
        }
      }
      // Return the smallest step or a very small value to allow any position
      return minDiff !== Infinity ? minDiff : step;
    }
    return step;
  }, [steps, computedSteps, step]);

  const handleChange = (newValue: number) => {
    if (Array.isArray(steps) && computedSteps && computedSteps.length > 0) {
      // Array mode: snap to nearest step and call onStepsChange
      const nearest = computedSteps.reduce((prev, curr) => {
        return Math.abs(curr.value - newValue) < Math.abs(prev.value - newValue)
          ? curr
          : prev;
      });
      onChange(nearest.value);
      
      if (onStepsChange && computedSteps) {
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
      // Default behavior: allow smooth sliding without snapping
      onChange(newValue);
    }
  };

  console.log({value, className, fillPercentage, step, computedSteps})

  return (
    <div className="relative w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={inputStep}
        value={value}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        disabled={disabled}
        className={twJoin(
          "bbn-slider",
          `bbn-slider-${variant}`,
          showFill && "bbn-slider-filled",
          disabled && "bbn-slider-disabled",
          visibleSteps.length > 0 && "bbn-slider-with-steps",
          className
        )}
        style={{
          "--slider-fill": `${fillPercentage}%`,
          "--slider-active-color": activeColor,
        } as React.CSSProperties}
      />
      
      {/* Step markers - white circles for each step */}
      {visibleSteps.length > 0 && (
        <div
          className="absolute left-0 right-0 pointer-events-none z-10"
          style={{ top: "calc(50% - 1px)" }}
        >
          {visibleSteps.map((stepItem, index) => {
            const position = ((stepItem.value - min) / (max - min)) * 100;
            return (
              <div
                key={index}
                className="absolute rounded-full bg-white"
                style={{
                  width: '4px',
                  height: '4px',
                  left: `calc(${position}% - 1px)`,
                }}
              />
            );
          })}
        </div>
      )}
      
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
