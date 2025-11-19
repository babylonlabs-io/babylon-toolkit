import React, { useState, useMemo } from "react";
import defaultWaveConfigJson from "./defaultWaveConfig.json";

export interface GradientStop {
  color: string;
  offset: number; // 0-100 percentage
}

export interface GradientConfig {
  stops: GradientStop[];
  direction?: "vertical" | "horizontal";
  opacity?: number; // Opacity for the gradient (0-1)
}

export interface SolidFillConfig {
  color: string;
  opacity?: number; // Opacity for the solid fill (0-1)
}

export type FillColor = string | SolidFillConfig | GradientConfig;

export interface StrokeWidthStop {
  width: number; // stroke width in pixels
  offset: number; // 0-100 percentage
}

export interface ValueRange {
  min: number;
  max: number;
}

export type AnimatedValue = number | ValueRange;

export interface MiddlePoint {
  x: number; // 0-100, percentage from left
  y: number; // 0-100, percentage from top
}

export interface RadialBlurConfig {
  centerX: number; // 0-100, percentage from left (center of radial blur)
  centerY: number; // 0-100, percentage from top (center of radial blur)
  radius: number; // 0-100, percentage of diagonal (radius of blur effect)
  intensity: number; // 0-100, intensity of the blur effect
}

export interface WaveConfig {
  startY: AnimatedValue; // 0-100, percentage from top (for horizontal waves)
  endY: AnimatedValue; // 0-100, percentage from top (for horizontal waves)
  startX?: AnimatedValue; // 0-200, percentage from left (for vertical waves)
  endX?: AnimatedValue; // 0-200, percentage from left (for vertical waves)
  inverted: boolean; // If true, fill is above/left of the line instead of below/right
  direction?: "horizontal" | "vertical"; // Wave direction
  strokeWidth?: AnimatedValue; // Per-wave stroke width (overrides global)
  strokeWidthStops?: StrokeWidthStop[]; // Per-wave stroke width stops (overrides global)
  middlePoints?: MiddlePoint[]; // Optional points the curve must pass through
  blurType?: "none" | "gaussian" | "radial"; // Type of blur effect
  blurAmount?: number; // Blur amount (0-50 for gaussian)
  radialBlur?: RadialBlurConfig; // Radial blur configuration (only used when blurType is "radial")
  maskBy?: number; // Index of the wave to use as a mask (this wave will only be visible where the mask wave is visible)
  anchorTo?: number; // Index of the wave to anchor to (this wave will have the same curvature as the anchor wave)
  hidden?: boolean; // If true, this wave will not be rendered
  color?: FillColor; // Per-wave line color/gradient (overrides global colors array)
  fillColor?: FillColor; // Per-wave fill color/gradient (overrides global fillColors array)
}

export interface WaveBackgroundConfig {
  speed: AnimatedValue;
  amplitude: AnimatedValue;
  frequency: AnimatedValue;
  waveAmplitude: AnimatedValue;
  strokeWidth: AnimatedValue; // Can be a fixed value or a range
  strokeWidthStops?: StrokeWidthStop[]; // Variable stroke width stops
  waveCount: number;
  showFill: boolean;
  colors: string[];
  fillColors: FillColor[];
  floatSpeed: number; // How fast values float between min and max (0.01 to 1.0)
  waves?: WaveConfig[]; // Per-wave configuration
  backgroundColor?: string; // Background color (hex or rgba)
  waveOpacity?: number; // Wave opacity (0-1)
  paused?: boolean; // If true, animation is paused
}

export const DEFAULT_CONFIG: WaveBackgroundConfig = defaultWaveConfigJson as unknown as WaveBackgroundConfig;

const PRESETS = {
  subtle: {
    speed: 0.00003,
    amplitude: 0.3,
    frequency: 0.8,
    waveAmplitude: 0.8,
    strokeWidth: 2 as AnimatedValue,
    waveCount: 5,
    showFill: true,
    colors: ["#F4BE43", "#EC762E", "#D67E3A"],
    fillColors: ["rgba(244, 190, 67, 0.2)", "rgba(236, 118, 46, 0.2)", "rgba(214, 126, 58, 0.2)"],
    floatSpeed: 0.08,
  },
  dramatic: {
    speed: 0.00008,
    amplitude: 0.7,
    frequency: 1.5,
    waveAmplitude: 2,
    strokeWidth: 6 as AnimatedValue,
    waveCount: 7,
    showFill: true,
    colors: ["#F4BE43", "#EC762E", "#D67E3A", "#C55A28"],
    fillColors: ["rgba(244, 190, 67, 0.4)", "rgba(236, 118, 46, 0.4)", "rgba(214, 126, 58, 0.4)", "rgba(197, 90, 40, 0.4)"],
    floatSpeed: 0.15,
  },
  smooth: {
    speed: 0.00005,
    amplitude: 0.4,
    frequency: 0.9,
    waveAmplitude: 1.5,
    strokeWidth: 3 as AnimatedValue,
    waveCount: 5,
    showFill: true,
    colors: ["#F4BE43", "#EC762E", "#D67E3A"],
    fillColors: ["rgba(244, 190, 67, 0.25)", "rgba(236, 118, 46, 0.25)", "rgba(214, 126, 58, 0.25)"],
    floatSpeed: 0.1,
  },
  gradient: {
    speed: 0.00005,
    amplitude: 0.5,
    frequency: 1,
    waveAmplitude: 1.25,
    strokeWidth: 4 as AnimatedValue,
    waveCount: 5,
    showFill: true,
    colors: ["#F4BE43", "#EC762E", "#D67E3A"],
    fillColors: [
      { stops: [{ color: "rgba(244, 190, 67, 0.4)", offset: 0 }, { color: "rgba(244, 190, 67, 0.1)", offset: 100 }], direction: "vertical" as const },
      { stops: [{ color: "rgba(236, 118, 46, 0.4)", offset: 0 }, { color: "rgba(236, 118, 46, 0.1)", offset: 100 }], direction: "vertical" as const },
      { stops: [{ color: "rgba(214, 126, 58, 0.4)", offset: 0 }, { color: "rgba(214, 126, 58, 0.1)", offset: 100 }], direction: "vertical" as const },
    ],
    floatSpeed: 0.1,
  },
};

interface WaveBackgroundControlsProps {
  config: WaveBackgroundConfig;
  onChange: (config: WaveBackgroundConfig) => void;
  onClose?: () => void;
  currentValues?: {
    speed: number;
    amplitude: number;
    frequency: number;
    waveAmplitude: number;
    strokeWidth?: number;
    waveValues?: Array<{
      startY?: number;
      endY?: number;
      startX?: number;
      endX?: number;
      strokeWidth?: number;
    }>;
  };
  onPauseChange?: (paused: boolean) => void;
}

interface ControlSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

function ControlSection({ title, defaultExpanded = false, children }: ControlSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </h3>
        <span className="text-gray-400">
          {expanded ? "▼" : "▶"}
        </span>
      </button>
      {expanded && <div className="pb-4 space-y-4">{children}</div>}
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

function ColorInputControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [textValue, setTextValue] = useState(value);

  React.useEffect(() => {
    setTextValue(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTextValue(val);
    if (/^#[0-9A-Fa-f]{6}$/i.test(val)) {
      onChange(val.toUpperCase());
    } else if (val.toLowerCase() === "transparent") {
      onChange("transparent");
    }
  };

  const handleTextBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/i.test(textValue) && textValue.toLowerCase() !== "transparent") {
      setTextValue(value);
    }
  };

  const isTransparent = value.toLowerCase() === "transparent";
  const colorInputValue = isTransparent ? "#000000" : value;

  return (
    <div>
      {label && (
        <label className="mb-2 block text-xs text-gray-600 dark:text-gray-400">
          {label}
        </label>
      )}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={colorInputValue}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={isTransparent}
          className={`h-10 w-20 rounded border border-gray-300 dark:border-gray-600 ${
            isTransparent 
              ? "cursor-not-allowed opacity-50" 
              : "cursor-pointer"
          }`}
        />
        <input
          type="text"
          value={textValue}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="#000000 or transparent"
        />
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
}: SliderControlProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  
  React.useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    }
  };

  const handleInputBlur = () => {
    const num = parseFloat(inputValue);
    if (isNaN(num) || num < min) {
      const clamped = min;
      setInputValue(clamped.toString());
      onChange(clamped);
    } else if (num > max) {
      const clamped = max;
      setInputValue(clamped.toString());
      onChange(clamped);
    } else {
      onChange(num);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-xs text-gray-600 dark:text-gray-400">
          {label}
        </label>
        <input
          type="number"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          min={min}
          max={max}
          step={step}
          className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="w-16 text-right text-xs text-gray-500 dark:text-gray-400">
          {format(value)}
        </span>
      </div>
    </div>
  );
}

interface RangeControlProps {
  label: string;
  value: AnimatedValue;
  min: number;
  max: number;
  step: number;
  onChange: (value: AnimatedValue) => void;
  format?: (value: number) => string;
  currentValue?: number;
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
  currentValue,
}: RangeControlProps) {
  const isRange = typeof value === "object";
  const fixedValue = typeof value === "number" ? value : (value.min + value.max) / 2;
  const rangeMin = typeof value === "object" ? value.min : fixedValue;
  const rangeMax = typeof value === "object" ? value.max : fixedValue;
  const displayValue = currentValue !== undefined ? currentValue : (isRange ? (rangeMin + rangeMax) / 2 : fixedValue);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs text-gray-600 dark:text-gray-400">
          {label}
          {isRange && currentValue !== undefined && (
            <span className="ml-2 text-xs font-medium text-blue-600 dark:text-blue-400">
              (Current: {format(currentValue)})
            </span>
          )}
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={isRange}
            onChange={(e) => {
              if (e.target.checked) {
                onChange({ min: fixedValue, max: fixedValue });
              } else {
                onChange(fixedValue);
              }
            }}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Use Range
        </label>
      </div>
      {isRange ? (
        <div className="space-y-2 rounded border border-gray-200 p-2 dark:border-gray-700">
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              Min
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={min}
                max={Math.min(max, rangeMax - step)}
                step={step}
                value={rangeMin}
                onChange={(e) => onChange({ min: parseFloat(e.target.value), max: rangeMax })}
                className="flex-1"
              />
              <input
                type="number"
                min={min}
                max={rangeMax - step}
                step={step}
                value={rangeMin}
                onChange={(e) => {
                  const val = Math.max(min, Math.min(rangeMax - step, parseFloat(e.target.value) || min));
                  onChange({ min: val, max: rangeMax });
                }}
                className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <span className="w-16 text-right text-xs text-gray-500 dark:text-gray-400">
                {format(rangeMin)}
              </span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              Max
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={Math.max(min, rangeMin + step)}
                max={max}
                step={step}
                value={rangeMax}
                onChange={(e) => onChange({ min: rangeMin, max: parseFloat(e.target.value) })}
                className="flex-1"
              />
              <input
                type="number"
                min={rangeMin + step}
                max={max}
                step={step}
                value={rangeMax}
                onChange={(e) => {
                  const val = Math.max(rangeMin + step, Math.min(max, parseFloat(e.target.value) || max));
                  onChange({ min: rangeMin, max: val });
                }}
                className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <span className="w-16 text-right text-xs text-gray-500 dark:text-gray-400">
                {format(rangeMax)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={fixedValue}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={fixedValue}
            onChange={(e) => {
              const val = Math.max(min, Math.min(max, parseFloat(e.target.value) || min));
              onChange(val);
            }}
            className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <span className="w-16 text-right text-xs text-gray-500 dark:text-gray-400">
            {format(fixedValue)}
          </span>
        </div>
      )}
    </div>
  );
}

export function WaveBackgroundControls({
  config,
  onChange,
  onClose,
  currentValues,
  onPauseChange,
}: WaveBackgroundControlsProps) {
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [colorsError, setColorsError] = useState<string | null>(null);
  const [fillColorsError, setFillColorsError] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, width: 0 });
  const [panelWidth, setPanelWidth] = useState(420);
  const [expandedWaves, setExpandedWaves] = useState<Set<number>>(new Set());
  const panelRef = React.useRef<HTMLDivElement>(null);
  const configHistoryRef = React.useRef<WaveBackgroundConfig[]>([]);
  const isUndoingRef = React.useRef(false);
  
  React.useEffect(() => {
    if (!isUndoingRef.current) {
      const currentConfig = JSON.stringify(config);
      const lastConfig = configHistoryRef.current.length > 0 
        ? JSON.stringify(configHistoryRef.current[configHistoryRef.current.length - 1])
        : null;
      
      if (currentConfig !== lastConfig) {
        configHistoryRef.current.push(JSON.parse(JSON.stringify(config)));
        if (configHistoryRef.current.length > 50) {
          configHistoryRef.current.shift();
        }
      }
    }
    isUndoingRef.current = false;
  }, [config]);
  
  const updateConfig = (updates: Partial<WaveBackgroundConfig>) => {
    onChange({ ...config, ...updates });
  };

  const handleUndo = () => {
    if (configHistoryRef.current.length <= 1) return;
    
    isUndoingRef.current = true;
    configHistoryRef.current.pop();
    const previousConfig = configHistoryRef.current[configHistoryRef.current.length - 1];
    if (previousConfig) {
      onChange(JSON.parse(JSON.stringify(previousConfig)));
    }
  };

  const canUndo = configHistoryRef.current.length > 1;

  const canRemoveWave = (waveIndex: number): boolean => {
    if (config.waveCount <= 1) return false;
    
    const waves = config.waves || [];
    for (let i = 0; i < waves.length; i++) {
      if (waves[i].maskBy === waveIndex || waves[i].anchorTo === waveIndex) {
        return false;
      }
    }
    return true;
  };

  const removeWave = (waveIndex: number) => {
    if (!canRemoveWave(waveIndex)) return;
    
    const newWaves = [...(config.waves || [])];
    newWaves.splice(waveIndex, 1);
    
    const updatedWaves = newWaves.map(wave => {
      const updatedWave = { ...wave };
      if (updatedWave.maskBy !== undefined) {
        if (updatedWave.maskBy === waveIndex) {
          delete updatedWave.maskBy;
        } else if (updatedWave.maskBy > waveIndex) {
          updatedWave.maskBy = updatedWave.maskBy - 1;
        }
      }
      if (updatedWave.anchorTo !== undefined) {
        if (updatedWave.anchorTo === waveIndex) {
          delete updatedWave.anchorTo;
        } else if (updatedWave.anchorTo > waveIndex) {
          updatedWave.anchorTo = updatedWave.anchorTo - 1;
        }
      }
      return updatedWave;
    });
    
    updateConfig({
      waveCount: config.waveCount - 1,
      waves: updatedWaves,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (panelRef.current && target.closest('button, input, select, textarea') === null) {
      e.preventDefault();
      setIsDragging(true);
      const rect = panelRef.current.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const newWidth = Math.max(300, Math.min(800, resizeStart.width + deltaX));
        setPanelWidth(newWidth);
      } else if (isDragging && panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        setPosition({
          x: Math.max(0, Math.min(maxX, newX)),
          y: Math.max(0, Math.min(maxY, newY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragStart, resizeStart]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (panelRef.current) {
      setIsResizing(true);
      setResizeStart({
        x: e.clientX,
        width: panelRef.current.offsetWidth,
      });
    }
  };

  const toggleWaveExpanded = (index: number) => {
    const newExpanded = new Set(expandedWaves);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedWaves(newExpanded);
  };

  const getFullConfig = useMemo(() => {
    const configToCopy: WaveBackgroundConfig = {
      speed: config.speed,
      amplitude: config.amplitude,
      frequency: config.frequency,
      waveAmplitude: config.waveAmplitude,
      strokeWidth: config.strokeWidth,
      waveCount: config.waveCount,
      showFill: config.showFill,
      floatSpeed: config.floatSpeed,
      colors: [...config.colors],
      fillColors: config.fillColors.map(fill => {
        if (typeof fill === "string") {
          return fill;
        }
        if ("color" in fill && !("stops" in fill)) {
          return {
            color: fill.color,
            ...(fill.opacity !== undefined && { opacity: fill.opacity }),
          };
        }
        return {
          stops: fill.stops.map(stop => ({ ...stop })),
          ...(fill.direction && { direction: fill.direction }),
          ...(fill.opacity !== undefined && { opacity: fill.opacity }),
        };
      }),
      ...(config.backgroundColor && { backgroundColor: config.backgroundColor }),
      ...(config.waveOpacity !== undefined && { waveOpacity: config.waveOpacity }),
      ...(config.strokeWidthStops && config.strokeWidthStops.length > 0 && {
        strokeWidthStops: config.strokeWidthStops.map(stop => ({ ...stop })),
      }),
      ...(config.waves && config.waves.length > 0 && {
        waves: config.waves.map(wave => {
          const waveObj: any = {
            startY: wave.startY,
            endY: wave.endY,
            inverted: wave.inverted,
          };
          if (wave.startX !== undefined) waveObj.startX = wave.startX;
          if (wave.endX !== undefined) waveObj.endX = wave.endX;
          if (wave.direction) waveObj.direction = wave.direction;
          if (wave.strokeWidth !== undefined) waveObj.strokeWidth = wave.strokeWidth;
          if (wave.strokeWidthStops && wave.strokeWidthStops.length > 0) {
            waveObj.strokeWidthStops = wave.strokeWidthStops.map(stop => ({ ...stop }));
          }
          if (wave.blurType && wave.blurType !== "none") {
            waveObj.blurType = wave.blurType;
            if (wave.blurType === "gaussian" && wave.blurAmount !== undefined) {
              waveObj.blurAmount = wave.blurAmount;
            }
            if (wave.blurType === "radial" && wave.radialBlur) {
              waveObj.radialBlur = { ...wave.radialBlur };
            }
          }
          if (wave.middlePoints && wave.middlePoints.length > 0) {
            waveObj.middlePoints = wave.middlePoints.map(point => ({ ...point }));
          }
          if (wave.maskBy !== undefined) {
            waveObj.maskBy = wave.maskBy;
          }
          if (wave.anchorTo !== undefined) {
            waveObj.anchorTo = wave.anchorTo;
          }
          if (wave.hidden !== undefined) {
            waveObj.hidden = wave.hidden;
          }
          if (wave.color !== undefined) {
            if (typeof wave.color === "string") {
              waveObj.color = wave.color;
            } else if ("color" in wave.color && !("stops" in wave.color)) {
              waveObj.color = {
                color: wave.color.color,
                ...(wave.color.opacity !== undefined && { opacity: wave.color.opacity }),
              };
            } else if ("stops" in wave.color) {
              waveObj.color = {
                stops: wave.color.stops.map(stop => ({ ...stop })),
                ...(wave.color.direction && { direction: wave.color.direction }),
                ...(wave.color.opacity !== undefined && { opacity: wave.color.opacity }),
              };
            }
          }
          if (wave.fillColor !== undefined) {
            if (typeof wave.fillColor === "string") {
              waveObj.fillColor = wave.fillColor;
            } else if ("color" in wave.fillColor && !("stops" in wave.fillColor)) {
              waveObj.fillColor = {
                color: wave.fillColor.color,
                ...(wave.fillColor.opacity !== undefined && { opacity: wave.fillColor.opacity }),
              };
            } else if ("stops" in wave.fillColor) {
              waveObj.fillColor = {
                stops: wave.fillColor.stops.map(stop => ({ ...stop })),
                ...(wave.fillColor.direction && { direction: wave.fillColor.direction }),
                ...(wave.fillColor.opacity !== undefined && { opacity: wave.fillColor.opacity }),
              };
            }
          }
          return waveObj;
        }),
      }),
      ...(config.paused !== undefined && { paused: config.paused }),
    };
    return configToCopy;
  }, [config]);

  const configJsonString = useMemo(() => {
    return JSON.stringify(getFullConfig, null, 2);
  }, [getFullConfig]);

  const copySettings = async () => {
    try {
      await navigator.clipboard.writeText(configJsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const resetToDefaults = () => {
    onChange({ ...DEFAULT_CONFIG });
  };

  const applyPreset = (presetName: keyof typeof PRESETS) => {
    onChange({ ...PRESETS[presetName] });
  };

  const importSettings = () => {
    try {
      const parsed = JSON.parse(importText);
      if (typeof parsed === "object" && parsed !== null) {
        onChange({ ...DEFAULT_CONFIG, ...parsed });
        setImportText("");
        setShowImport(false);
        setImportError(null);
      }
    } catch (err) {
      setImportError("Invalid JSON format");
    }
  };

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    ...(position.y === 0 && position.x === 0
      ? { bottom: "1rem", right: "1rem" }
      : { left: `${position.x}px`, top: `${position.y}px` }),
    zIndex: 50,
    width: `${panelWidth}px`,
    maxHeight: "85vh",
    cursor: isDragging ? "grabbing" : "default",
  };

  return (
    <div 
      ref={panelRef}
      className={`fixed z-50 max-h-[85vh] overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-800 flex flex-col relative ${
        position.y === 0 && position.x === 0 ? "bottom-4 right-4" : ""
      }`}
      style={panelStyle}
    >
      <div 
        className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-4 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wave Background Controls</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                canUndo
                  ? "border-gray-500 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  : "border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600"
              }`}
              title={canUndo ? "Undo last change" : "No changes to undo"}
            >
              ↶ Undo
            </button>
            <button
              onClick={() => {
                const newPaused = !config.paused;
                updateConfig({ paused: newPaused });
                onPauseChange?.(newPaused);
              }}
              className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                config.paused
                  ? "border-red-500 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-600 dark:bg-red-900/20 dark:text-red-400"
                  : "border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-600 dark:bg-green-900/20 dark:text-green-400"
              }`}
              title={config.paused ? "Resume animation" : "Pause animation"}
            >
              {config.paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              onClick={copySettings}
              className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
              title="Copy settings to clipboard"
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={resetToDefaults}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Reset
          </button>
          <button
            onClick={() => applyPreset("subtle")}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Subtle
          </button>
          <button
            onClick={() => applyPreset("smooth")}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Smooth
          </button>
          <button
            onClick={() => applyPreset("dramatic")}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Dramatic
          </button>
          <button
            onClick={() => applyPreset("gradient")}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Gradient
          </button>
                  <button
                    onClick={() => setShowImport(!showImport)}
                    className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    {showImport ? "Cancel" : "Import"}
                  </button>
                  <button
                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                    className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    {showJsonPreview ? "Hide JSON" : "Show JSON"}
                  </button>
                </div>
                
                {showImport && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={importText}
                      onChange={(e) => {
                        setImportText(e.target.value);
                        setImportError(null);
                      }}
                      placeholder="Paste JSON config here..."
                      className="w-full rounded border border-gray-300 bg-white p-2 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono"
                      rows={6}
                    />
                    {importError && (
                      <p className="text-xs text-red-500">{importError}</p>
                    )}
                    <button
                      onClick={importSettings}
                      className="w-full rounded bg-green-500 px-3 py-1.5 text-xs text-white hover:bg-green-600"
                    >
                      Apply Import
                    </button>
                  </div>
                )}

                {showJsonPreview && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Live JSON Preview
                    </label>
                    <textarea
                      value={configJsonString}
                      readOnly
                      className="w-full rounded border border-gray-300 bg-gray-50 p-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 font-mono"
                      rows={12}
                      style={{ resize: "vertical", minHeight: "200px" }}
                    />
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Config updates automatically as you change controls</span>
                      <button
                        onClick={copySettings}
                        className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
                      >
                        {copied ? "✓ Copied!" : "Copy JSON"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          <ControlSection title="Animation">
            <RangeControl
              label="Speed"
              value={config.speed}
              min={0.00001}
              max={0.001}
              step={0.00001}
              onChange={(value) => updateConfig({ speed: value })}
              format={(v) => v.toFixed(5)}
              currentValue={currentValues?.speed}
            />
            <RangeControl
              label="Amplitude"
              value={config.amplitude}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(value) => updateConfig({ amplitude: value })}
              currentValue={currentValues?.amplitude}
            />
            <RangeControl
              label="Frequency"
              value={config.frequency}
              min={0.5}
              max={3}
              step={0.1}
              onChange={(value) => updateConfig({ frequency: value })}
              currentValue={currentValues?.frequency}
            />
          </ControlSection>

          <ControlSection title="Curve Shape">
            <RangeControl
              label="Wave Amplitude"
              value={config.waveAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(value) => updateConfig({ waveAmplitude: value })}
              currentValue={currentValues?.waveAmplitude}
            />
          </ControlSection>

          <ControlSection title="Appearance">
            <div className="mb-3">
              <label className="mb-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={!!config.strokeWidthStops && config.strokeWidthStops.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const strokeWidthValue = typeof config.strokeWidth === "number" ? config.strokeWidth : (typeof config.strokeWidth === "object" ? (config.strokeWidth.min + config.strokeWidth.max) / 2 : 4);
                      updateConfig({
                        strokeWidthStops: [
                          { width: 0, offset: 0 },
                          { width: strokeWidthValue, offset: 50 },
                          { width: 0, offset: 100 },
                        ],
                      });
                    } else {
                      updateConfig({ strokeWidthStops: undefined });
                    }
                  }}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Use Variable Stroke Width
              </label>
            </div>
            {!config.strokeWidthStops || config.strokeWidthStops.length === 0 ? (
              <RangeControl
                label="Stroke Width"
                value={typeof config.strokeWidth === "number" || typeof config.strokeWidth === "object" ? config.strokeWidth : 4}
                min={0}
                max={50}
                step={0.5}
                onChange={(value) => updateConfig({ strokeWidth: value })}
                format={(v) => v.toFixed(1)}
                currentValue={currentValues?.strokeWidth}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-gray-600 dark:text-gray-400">
                    Stroke Width Stops
                  </label>
                  <button
                    onClick={() => {
                      const newStops = [...(config.strokeWidthStops || [])];
                      const lastStop = newStops[newStops.length - 1];
                      newStops.push({
                        width: lastStop?.width || 0,
                        offset: Math.min(100, (lastStop?.offset || 0) + 10),
                      });
                      newStops.sort((a, b) => a.offset - b.offset);
                      updateConfig({ strokeWidthStops: newStops });
                    }}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    + Add Stop
                  </button>
                </div>
                {config.strokeWidthStops.map((stop, stopIndex) => (
                  <div
                    key={stopIndex}
                    className="rounded border border-gray-200 p-2 dark:border-gray-700"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Stop {stopIndex + 1}
                      </span>
                      {config.strokeWidthStops && config.strokeWidthStops.length > 1 && (
                        <button
                          onClick={() => {
                            const newStops = (config.strokeWidthStops || []).filter(
                              (_, i) => i !== stopIndex
                            );
                            updateConfig({ strokeWidthStops: newStops.length > 0 ? newStops : undefined });
                          }}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                          Offset (%)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={stop.offset}
                            onChange={(e) => {
                              const newStops = [...(config.strokeWidthStops || [])];
                              newStops[stopIndex].offset = parseFloat(e.target.value);
                              newStops.sort((a, b) => a.offset - b.offset);
                              updateConfig({ strokeWidthStops: newStops });
                            }}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={stop.offset}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                              const newStops = [...(config.strokeWidthStops || [])];
                              newStops[stopIndex].offset = val;
                              newStops.sort((a, b) => a.offset - b.offset);
                              updateConfig({ strokeWidthStops: newStops });
                            }}
                            className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                          Width (px)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={50}
                            step={0.5}
                            value={stop.width}
                            onChange={(e) => {
                              const newStops = [...(config.strokeWidthStops || [])];
                              newStops[stopIndex].width = parseFloat(e.target.value);
                              updateConfig({ strokeWidthStops: newStops });
                            }}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={0.5}
                            value={stop.width}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(50, parseFloat(e.target.value) || 0));
                              const newStops = [...(config.strokeWidthStops || [])];
                              newStops[stopIndex].width = val;
                              updateConfig({ strokeWidthStops: newStops });
                            }}
                            className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <SliderControl
              label="Wave Count"
              value={config.waveCount}
              min={1}
              max={10}
              step={1}
              onChange={(value) => {
                const newCount = Math.round(value);
                const newWaves = Array.from({ length: newCount }, (_, i) => {
                  if (config.waves?.[i]) {
                    return config.waves[i];
                  }
                  const yPercent = (i / (newCount - 1 || 1)) * 100;
                  const xPercent = (i / (newCount - 1 || 1)) * 100;
                  return { 
                    startY: yPercent, 
                    endY: yPercent, 
                    startX: xPercent,
                    endX: xPercent,
                    inverted: false,
                    direction: "horizontal" as const,
                  } as WaveConfig;
                });
                updateConfig({ waveCount: newCount, waves: newWaves });
              }}
              format={(v) => Math.round(v).toString()}
            />
                    <div>
                      <label className="mb-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={config.showFill}
                          onChange={(e) => updateConfig({ showFill: e.target.checked })}
                          className="rounded border-gray-300 dark:border-gray-600"
                        />
                        Show Fill
                      </label>
                    </div>
                    <ColorInputControl
                      label="Background Color"
                      value={config.backgroundColor || "#000000"}
                      onChange={(value) => updateConfig({ backgroundColor: value })}
                    />
                    <SliderControl
                      label="Wave Opacity"
                      value={config.waveOpacity ?? 1}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => updateConfig({ waveOpacity: value })}
                      format={(v) => v.toFixed(2)}
                    />
                  </ControlSection>

          <ControlSection title="Wave Positions">
            <div className="space-y-3">
              {Array.from({ length: config.waveCount }).map((_, index) => {
                const defaultY = (index / (config.waveCount - 1 || 1)) * 100;
                const defaultX = (index / (config.waveCount - 1 || 1)) * 100;
                const waveConfig = config.waves?.[index] || {
                  startY: defaultY,
                  endY: defaultY,
                  startX: defaultX,
                  endX: defaultX,
                  inverted: false,
                  direction: "horizontal",
                };
                const direction = waveConfig.direction || "horizontal";
                
                return (
                  <div
                    key={index}
                    className="rounded border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleWaveExpanded(index)}
                          className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                        >
                          <span className="text-xs text-gray-400">
                            {expandedWaves.has(index) ? "▼" : "▶"}
                          </span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            Wave {index + 1}
                          </span>
                        </button>
                        {!waveConfig.fillColor && config.fillColors && config.fillColors.length > 0 && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            Fill {((index % config.fillColors.length) + 1)}
                          </span>
                        )}
                        {waveConfig.fillColor && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            Custom Fill
                          </span>
                        )}
                        {waveConfig.color && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            Custom Color
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={waveConfig.hidden ?? false}
                            onChange={(e) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "horizontal",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], hidden: e.target.checked };
                              updateConfig({ waves: newWaves });
                            }}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          Hide
                        </label>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "horizontal",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], direction: "horizontal" };
                              updateConfig({ waves: newWaves });
                            }}
                            className={`rounded border px-2 py-0.5 text-xs ${
                              direction === "horizontal"
                                ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                : "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                            }`}
                          >
                            H
                          </button>
                          <button
                            onClick={() => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "vertical",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], direction: "vertical" };
                              updateConfig({ waves: newWaves });
                            }}
                            className={`rounded border px-2 py-0.5 text-xs ${
                              direction === "vertical"
                                ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                : "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                            }`}
                          >
                            V
                          </button>
                        </div>
                        <button
                          onClick={() => removeWave(index)}
                          disabled={!canRemoveWave(index)}
                          className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            canRemoveWave(index)
                              ? "border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/30"
                              : "border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600"
                          }`}
                          title={
                            !canRemoveWave(index)
                              ? config.waveCount <= 1
                                ? "Cannot remove the last wave"
                                : "Cannot remove wave that is being masked or anchored by another wave"
                              : "Remove this wave"
                          }
                        >
                          ✕ Remove
                        </button>
                        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={waveConfig.inverted}
                            onChange={(e) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "horizontal",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], inverted: e.target.checked };
                              updateConfig({ waves: newWaves });
                            }}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          Inverted
                        </label>
                      </div>
                    </div>
                    {expandedWaves.has(index) && (
                      <>
                    <div className="space-y-3 mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                          Line Color/Gradient
                        </label>
                        {(() => {
                          const currentColor = waveConfig.color ?? (config.colors[index % config.colors.length] || "#8683B4");
                          const isGradient = typeof currentColor === "object" && currentColor !== null && "stops" in currentColor;
                          const isSolidConfig = typeof currentColor === "object" && currentColor !== null && "color" in currentColor;
                          const isPlainString = typeof currentColor === "string";
                          const gradient = isGradient ? currentColor as GradientConfig : null;
                          const solidConfig = isSolidConfig ? currentColor as SolidFillConfig : null;
                          const solidColor = isPlainString ? currentColor : (isSolidConfig ? solidConfig?.color : null);
                          
                          return (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const newWaves = [...(config.waves || [])];
                                    while (newWaves.length <= index) {
                                      const i = newWaves.length;
                                      const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      newWaves.push({ 
                                        startY: yPercent, 
                                        endY: yPercent, 
                                        startX: xPercent,
                                        endX: xPercent,
                                        inverted: false,
                                        direction: "horizontal",
                                      });
                                    }
                                    if (isGradient) {
                                      const baseColor = gradient?.stops[0]?.color || "#8683B4";
                                      const opacity = gradient?.opacity;
                                      if (opacity !== undefined && opacity !== 1) {
                                        newWaves[index] = { ...newWaves[index], color: { color: baseColor, opacity } as SolidFillConfig };
                                      } else {
                                        newWaves[index] = { ...newWaves[index], color: baseColor };
                                      }
                                    } else {
                                      const baseColor = solidColor || "#8683B4";
                                      const opacity = isSolidConfig ? solidConfig?.opacity : undefined;
                                      newWaves[index] = {
                                        ...newWaves[index],
                                        color: {
                                          stops: [
                                            { color: baseColor, offset: 0 },
                                            { color: baseColor, offset: 100 },
                                          ],
                                          direction: "vertical",
                                          ...(opacity !== undefined && { opacity }),
                                        } as GradientConfig,
                                      };
                                    }
                                    updateConfig({ waves: newWaves });
                                  }}
                                  className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                                >
                                  {isGradient ? "Switch to Solid" : "Switch to Gradient"}
                                </button>
                                <button
                                  onClick={() => {
                                    const newWaves = [...(config.waves || [])];
                                    while (newWaves.length <= index) {
                                      const i = newWaves.length;
                                      const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      newWaves.push({ 
                                        startY: yPercent, 
                                        endY: yPercent, 
                                        startX: xPercent,
                                        endX: xPercent,
                                        inverted: false,
                                        direction: "horizontal",
                                      });
                                    }
                                    newWaves[index] = { ...newWaves[index], color: "transparent" };
                                    updateConfig({ waves: newWaves });
                                  }}
                                  className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                                    isPlainString && currentColor === "transparent"
                                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                                  }`}
                                >
                                  Transparent
                                </button>
                              </div>
                              {isGradient && gradient ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600 dark:text-gray-400">Gradient Stops</span>
                                    <button
                                      onClick={() => {
                                        const newWaves = [...(config.waves || [])];
                                        while (newWaves.length <= index) {
                                          const i = newWaves.length;
                                          const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          newWaves.push({ 
                                            startY: yPercent, 
                                            endY: yPercent, 
                                            startX: xPercent,
                                            endX: xPercent,
                                            inverted: false,
                                            direction: "horizontal",
                                          });
                                        }
                                        const color = (newWaves[index].color || { stops: [] }) as GradientConfig;
                                        if (color.stops) {
                                          const newStop: GradientStop = {
                                            color: color.stops[color.stops.length - 1]?.color || "#8683B4",
                                            offset: Math.min(100, (color.stops[color.stops.length - 1]?.offset || 0) + 10),
                                          };
                                          color.stops.push(newStop);
                                          color.stops.sort((a, b) => a.offset - b.offset);
                                          newWaves[index] = { ...newWaves[index], color: color };
                                          updateConfig({ waves: newWaves });
                                        }
                                      }}
                                      className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                                    >
                                      + Add Stop
                                    </button>
                                  </div>
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {gradient.stops.map((stop, stopIndex) => (
                                      <div key={stopIndex} className="rounded border border-gray-200 p-2 dark:border-gray-700">
                                        <div className="mb-1 flex items-center justify-between">
                                          <span className="text-xs text-gray-500 dark:text-gray-400">Stop {stopIndex + 1}</span>
                                          {gradient.stops.length > 1 && (
                                            <button
                                              onClick={() => {
                                                const newWaves = [...(config.waves || [])];
                                                while (newWaves.length <= index) {
                                                  const i = newWaves.length;
                                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  newWaves.push({ 
                                                    startY: yPercent, 
                                                    endY: yPercent, 
                                                    startX: xPercent,
                                                    endX: xPercent,
                                                    inverted: false,
                                                    direction: "horizontal",
                                                  });
                                                }
                                                const color = (newWaves[index].color || { stops: [] }) as GradientConfig;
                                                if (color.stops) {
                                                  color.stops = color.stops.filter((_, i) => i !== stopIndex);
                                                  newWaves[index] = { ...newWaves[index], color: color };
                                                  updateConfig({ waves: newWaves });
                                                }
                                              }}
                                              className="text-red-500 hover:text-red-700 text-xs"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="range"
                                              min={0}
                                              max={100}
                                              step={1}
                                              value={stop.offset}
                                              onChange={(e) => {
                                                const newWaves = [...(config.waves || [])];
                                                while (newWaves.length <= index) {
                                                  const i = newWaves.length;
                                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  newWaves.push({ 
                                                    startY: yPercent, 
                                                    endY: yPercent, 
                                                    startX: xPercent,
                                                    endX: xPercent,
                                                    inverted: false,
                                                    direction: "horizontal",
                                                  });
                                                }
                                                const color = (newWaves[index].color || { stops: [] }) as GradientConfig;
                                                if (color.stops) {
                                                  color.stops[stopIndex].offset = parseFloat(e.target.value);
                                                  color.stops.sort((a, b) => a.offset - b.offset);
                                                  newWaves[index] = { ...newWaves[index], color: color };
                                                  updateConfig({ waves: newWaves });
                                                }
                                              }}
                                              className="flex-1"
                                            />
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              step={1}
                                              value={stop.offset}
                                              onChange={(e) => {
                                                const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                                const newWaves = [...(config.waves || [])];
                                                while (newWaves.length <= index) {
                                                  const i = newWaves.length;
                                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  newWaves.push({ 
                                                    startY: yPercent, 
                                                    endY: yPercent, 
                                                    startX: xPercent,
                                                    endX: xPercent,
                                                    inverted: false,
                                                    direction: "horizontal",
                                                  });
                                                }
                                                const color = (newWaves[index].color || { stops: [] }) as GradientConfig;
                                                if (color.stops) {
                                                  color.stops[stopIndex].offset = val;
                                                  color.stops.sort((a, b) => a.offset - b.offset);
                                                  newWaves[index] = { ...newWaves[index], color: color };
                                                  updateConfig({ waves: newWaves });
                                                }
                                              }}
                                              className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            />
                                          </div>
                                          <ColorInputControl
                                            label=""
                                            value={stop.color}
                                            onChange={(value) => {
                                              const newWaves = [...(config.waves || [])];
                                              while (newWaves.length <= index) {
                                                const i = newWaves.length;
                                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                newWaves.push({ 
                                                  startY: yPercent, 
                                                  endY: yPercent, 
                                                  startX: xPercent,
                                                  endX: xPercent,
                                                  inverted: false,
                                                  direction: "horizontal",
                                                });
                                              }
                                              const color = (newWaves[index].color || { stops: [] }) as GradientConfig;
                                              if (color.stops) {
                                                color.stops[stopIndex].color = value;
                                                newWaves[index] = { ...newWaves[index], color: color };
                                                updateConfig({ waves: newWaves });
                                              }
                                            }}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <select
                                      value={gradient.direction || "vertical"}
                                      onChange={(e) => {
                                        const newWaves = [...(config.waves || [])];
                                        while (newWaves.length <= index) {
                                          const i = newWaves.length;
                                          const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          newWaves.push({ 
                                            startY: yPercent, 
                                            endY: yPercent, 
                                            startX: xPercent,
                                            endX: xPercent,
                                            inverted: false,
                                            direction: "horizontal",
                                          });
                                        }
                                        const color = (newWaves[index].color || { stops: [] }) as GradientConfig;
                                        color.direction = e.target.value as "vertical" | "horizontal";
                                        newWaves[index] = { ...newWaves[index], color: color };
                                        updateConfig({ waves: newWaves });
                                      }}
                                      className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                      <option value="vertical">Vertical</option>
                                      <option value="horizontal">Horizontal</option>
                                    </select>
                                  </div>
                                </div>
                              ) : !isPlainString && isSolidConfig ? (
                                <div className="space-y-2">
                                  <ColorInputControl
                                    label="Color"
                                    value={solidConfig.color}
                                    onChange={(value) => {
                                      const newWaves = [...(config.waves || [])];
                                      while (newWaves.length <= index) {
                                        const i = newWaves.length;
                                        const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        newWaves.push({ 
                                          startY: yPercent, 
                                          endY: yPercent, 
                                          startX: xPercent,
                                          endX: xPercent,
                                          inverted: false,
                                          direction: "horizontal",
                                        });
                                      }
                                      newWaves[index] = { ...newWaves[index], color: { color: value, opacity: solidConfig.opacity } as SolidFillConfig };
                                      updateConfig({ waves: newWaves });
                                    }}
                                  />
                                  {solidConfig.opacity !== undefined && (
                                    <SliderControl
                                      label="Opacity"
                                      value={solidConfig.opacity}
                                      min={0}
                                      max={1}
                                      step={0.01}
                                      onChange={(value) => {
                                        const newWaves = [...(config.waves || [])];
                                        while (newWaves.length <= index) {
                                          const i = newWaves.length;
                                          const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          newWaves.push({ 
                                            startY: yPercent, 
                                            endY: yPercent, 
                                            startX: xPercent,
                                            endX: xPercent,
                                            inverted: false,
                                            direction: "horizontal",
                                          });
                                        }
                                        const currentColor = newWaves[index].color as SolidFillConfig;
                                        newWaves[index] = { ...newWaves[index], color: { color: currentColor.color, opacity: value } as SolidFillConfig };
                                        updateConfig({ waves: newWaves });
                                      }}
                                    />
                                  )}
                                </div>
                              ) : (
                                <ColorInputControl
                                  label="Color"
                                  value={typeof currentColor === "string" ? currentColor : "#8683B4"}
                                  onChange={(value) => {
                                    const newWaves = [...(config.waves || [])];
                                    while (newWaves.length <= index) {
                                      const i = newWaves.length;
                                      const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      newWaves.push({ 
                                        startY: yPercent, 
                                        endY: yPercent, 
                                        startX: xPercent,
                                        endX: xPercent,
                                        inverted: false,
                                        direction: "horizontal",
                                      });
                                    }
                                    newWaves[index] = { ...newWaves[index], color: value };
                                    updateConfig({ waves: newWaves });
                                  }}
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                          Fill Color/Gradient
                        </label>
                        {(() => {
                          const currentFill = waveConfig.fillColor ?? (config.fillColors?.[index % (config.fillColors?.length || 1)] ?? config.colors[index % config.colors.length]);
                          const isGradient = typeof currentFill === "object" && currentFill !== null && "stops" in currentFill;
                          const isSolidConfig = typeof currentFill === "object" && currentFill !== null && "color" in currentFill;
                          const isPlainString = typeof currentFill === "string";
                          const gradient = isGradient ? currentFill as GradientConfig : null;
                          const solidConfig = isSolidConfig ? currentFill as SolidFillConfig : null;
                          const solidColor = isPlainString ? currentFill : (isSolidConfig ? solidConfig?.color : null);
                          
                          return (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const newWaves = [...(config.waves || [])];
                                    while (newWaves.length <= index) {
                                      const i = newWaves.length;
                                      const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      newWaves.push({ 
                                        startY: yPercent, 
                                        endY: yPercent, 
                                        startX: xPercent,
                                        endX: xPercent,
                                        inverted: false,
                                        direction: "horizontal",
                                      });
                                    }
                                    if (isGradient) {
                                      const baseColor = gradient?.stops[0]?.color || "rgba(244, 190, 67, 0.3)";
                                      const opacity = gradient?.opacity;
                                      if (opacity !== undefined && opacity !== 1) {
                                        newWaves[index] = { ...newWaves[index], fillColor: { color: baseColor, opacity } as SolidFillConfig };
                                      } else {
                                        newWaves[index] = { ...newWaves[index], fillColor: baseColor };
                                      }
                                    } else {
                                      const baseColor = solidColor || "rgba(244, 190, 67, 0.4)";
                                      const opacity = isSolidConfig ? solidConfig?.opacity : undefined;
                                      newWaves[index] = {
                                        ...newWaves[index],
                                        fillColor: {
                                          stops: [
                                            { color: baseColor, offset: 0 },
                                            { color: baseColor, offset: 100 },
                                          ],
                                          direction: "vertical",
                                          ...(opacity !== undefined && { opacity }),
                                        } as GradientConfig,
                                      };
                                    }
                                    updateConfig({ waves: newWaves });
                                  }}
                                  className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                                >
                                  {isGradient ? "Switch to Solid" : "Switch to Gradient"}
                                </button>
                                <button
                                  onClick={() => {
                                    const newWaves = [...(config.waves || [])];
                                    while (newWaves.length <= index) {
                                      const i = newWaves.length;
                                      const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                      newWaves.push({ 
                                        startY: yPercent, 
                                        endY: yPercent, 
                                        startX: xPercent,
                                        endX: xPercent,
                                        inverted: false,
                                        direction: "horizontal",
                                      });
                                    }
                                    const currentWave = newWaves[index] || {};
                                    const { fillColor, ...rest } = currentWave;
                                    newWaves[index] = rest;
                                    updateConfig({ waves: newWaves });
                                  }}
                                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                                  title="Remove fill for this wave"
                                >
                                  Remove Fill
                                </button>
                              </div>
                              {isGradient && gradient ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600 dark:text-gray-400">Gradient Stops</span>
                                    <button
                                      onClick={() => {
                                        const newWaves = [...(config.waves || [])];
                                        while (newWaves.length <= index) {
                                          const i = newWaves.length;
                                          const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          newWaves.push({ 
                                            startY: yPercent, 
                                            endY: yPercent, 
                                            startX: xPercent,
                                            endX: xPercent,
                                            inverted: false,
                                            direction: "horizontal",
                                          });
                                        }
                                        const fill = (newWaves[index].fillColor || { stops: [] }) as GradientConfig;
                                        if (fill.stops) {
                                          const newStop: GradientStop = {
                                            color: fill.stops[fill.stops.length - 1]?.color || "rgba(244, 190, 67, 0.3)",
                                            offset: Math.min(100, (fill.stops[fill.stops.length - 1]?.offset || 0) + 10),
                                          };
                                          fill.stops.push(newStop);
                                          fill.stops.sort((a, b) => a.offset - b.offset);
                                          newWaves[index] = { ...newWaves[index], fillColor: fill };
                                          updateConfig({ waves: newWaves });
                                        }
                                      }}
                                      className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                                    >
                                      + Add Stop
                                    </button>
                                  </div>
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {gradient.stops.map((stop, stopIndex) => (
                                      <div key={stopIndex} className="rounded border border-gray-200 p-2 dark:border-gray-700">
                                        <div className="mb-1 flex items-center justify-between">
                                          <span className="text-xs text-gray-500 dark:text-gray-400">Stop {stopIndex + 1}</span>
                                          {gradient.stops.length > 1 && (
                                            <button
                                              onClick={() => {
                                                const newWaves = [...(config.waves || [])];
                                                while (newWaves.length <= index) {
                                                  const i = newWaves.length;
                                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  newWaves.push({ 
                                                    startY: yPercent, 
                                                    endY: yPercent, 
                                                    startX: xPercent,
                                                    endX: xPercent,
                                                    inverted: false,
                                                    direction: "horizontal",
                                                  });
                                                }
                                                const fill = (newWaves[index].fillColor || { stops: [] }) as GradientConfig;
                                                if (fill.stops) {
                                                  fill.stops = fill.stops.filter((_, i) => i !== stopIndex);
                                                  newWaves[index] = { ...newWaves[index], fillColor: fill };
                                                  updateConfig({ waves: newWaves });
                                                }
                                              }}
                                              className="text-red-500 hover:text-red-700 text-xs"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="range"
                                              min={0}
                                              max={100}
                                              step={1}
                                              value={stop.offset}
                                              onChange={(e) => {
                                                const newWaves = [...(config.waves || [])];
                                                while (newWaves.length <= index) {
                                                  const i = newWaves.length;
                                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  newWaves.push({ 
                                                    startY: yPercent, 
                                                    endY: yPercent, 
                                                    startX: xPercent,
                                                    endX: xPercent,
                                                    inverted: false,
                                                    direction: "horizontal",
                                                  });
                                                }
                                                const fill = (newWaves[index].fillColor || { stops: [] }) as GradientConfig;
                                                if (fill.stops) {
                                                  fill.stops[stopIndex].offset = parseFloat(e.target.value);
                                                  fill.stops.sort((a, b) => a.offset - b.offset);
                                                  newWaves[index] = { ...newWaves[index], fillColor: fill };
                                                  updateConfig({ waves: newWaves });
                                                }
                                              }}
                                              className="flex-1"
                                            />
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              step={1}
                                              value={stop.offset}
                                              onChange={(e) => {
                                                const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                                const newWaves = [...(config.waves || [])];
                                                while (newWaves.length <= index) {
                                                  const i = newWaves.length;
                                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                  newWaves.push({ 
                                                    startY: yPercent, 
                                                    endY: yPercent, 
                                                    startX: xPercent,
                                                    endX: xPercent,
                                                    inverted: false,
                                                    direction: "horizontal",
                                                  });
                                                }
                                                const fill = (newWaves[index].fillColor || { stops: [] }) as GradientConfig;
                                                if (fill.stops) {
                                                  fill.stops[stopIndex].offset = val;
                                                  fill.stops.sort((a, b) => a.offset - b.offset);
                                                  newWaves[index] = { ...newWaves[index], fillColor: fill };
                                                  updateConfig({ waves: newWaves });
                                                }
                                              }}
                                              className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            />
                                          </div>
                                          <ColorInputControl
                                            label=""
                                            value={stop.color}
                                            onChange={(value) => {
                                              const newWaves = [...(config.waves || [])];
                                              while (newWaves.length <= index) {
                                                const i = newWaves.length;
                                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                                newWaves.push({ 
                                                  startY: yPercent, 
                                                  endY: yPercent, 
                                                  startX: xPercent,
                                                  endX: xPercent,
                                                  inverted: false,
                                                  direction: "horizontal",
                                                });
                                              }
                                              const fill = (newWaves[index].fillColor || { stops: [] }) as GradientConfig;
                                              if (fill.stops) {
                                                fill.stops[stopIndex].color = value;
                                                newWaves[index] = { ...newWaves[index], fillColor: fill };
                                                updateConfig({ waves: newWaves });
                                              }
                                            }}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        const newWaves = [...(config.waves || [])];
                                        while (newWaves.length <= index) {
                                          const i = newWaves.length;
                                          const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          newWaves.push({ 
                                            startY: yPercent, 
                                            endY: yPercent, 
                                            startX: xPercent,
                                            endX: xPercent,
                                            inverted: false,
                                            direction: "horizontal",
                                          });
                                        }
                                        const fill = (newWaves[index].fillColor || { stops: [], direction: "vertical" }) as GradientConfig;
                                        fill.direction = fill.direction === "horizontal" ? "vertical" : "horizontal";
                                        newWaves[index] = { ...newWaves[index], fillColor: fill };
                                        updateConfig({ waves: newWaves });
                                      }}
                                      className={`flex-1 rounded border px-2 py-1 text-xs ${
                                        gradient.direction === "vertical"
                                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                          : "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                                      }`}
                                    >
                                      {gradient.direction === "vertical" ? "Vertical" : "Horizontal"}
                                    </button>
                                  </div>
                                  <SliderControl
                                    label="Opacity"
                                    value={gradient.opacity ?? 1}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onChange={(value) => {
                                      const newWaves = [...(config.waves || [])];
                                      while (newWaves.length <= index) {
                                        const i = newWaves.length;
                                        const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        newWaves.push({ 
                                          startY: yPercent, 
                                          endY: yPercent, 
                                          startX: xPercent,
                                          endX: xPercent,
                                          inverted: false,
                                          direction: "horizontal",
                                        });
                                      }
                                      const fill = (newWaves[index].fillColor || { stops: [] }) as GradientConfig;
                                      fill.opacity = value;
                                      newWaves[index] = { ...newWaves[index], fillColor: fill };
                                      updateConfig({ waves: newWaves });
                                    }}
                                    format={(v) => v.toFixed(2)}
                                  />
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <ColorInputControl
                                    label=""
                                    value={solidColor || "#F4BE43"}
                                    onChange={(value) => {
                                      const newWaves = [...(config.waves || [])];
                                      while (newWaves.length <= index) {
                                        const i = newWaves.length;
                                        const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        newWaves.push({ 
                                          startY: yPercent, 
                                          endY: yPercent, 
                                          startX: xPercent,
                                          endX: xPercent,
                                          inverted: false,
                                          direction: "horizontal",
                                        });
                                      }
                                      if (isSolidConfig) {
                                        (newWaves[index].fillColor as SolidFillConfig).color = value;
                                      } else {
                                        newWaves[index] = { ...newWaves[index], fillColor: value };
                                      }
                                      updateConfig({ waves: newWaves });
                                    }}
                                  />
                                  <SliderControl
                                    label="Opacity"
                                    value={isSolidConfig ? (solidConfig?.opacity ?? 1) : 1}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onChange={(value) => {
                                      const newWaves = [...(config.waves || [])];
                                      while (newWaves.length <= index) {
                                        const i = newWaves.length;
                                        const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                        newWaves.push({ 
                                          startY: yPercent, 
                                          endY: yPercent, 
                                          startX: xPercent,
                                          endX: xPercent,
                                          inverted: false,
                                          direction: "horizontal",
                                        });
                                      }
                                      if (isPlainString || !isSolidConfig) {
                                        newWaves[index] = {
                                          ...newWaves[index],
                                          fillColor: {
                                            color: solidColor || "#F4BE43",
                                            opacity: value,
                                          } as SolidFillConfig,
                                        };
                                      } else {
                                        (newWaves[index].fillColor as SolidFillConfig).opacity = value;
                                      }
                                      updateConfig({ waves: newWaves });
                                    }}
                                    format={(v) => v.toFixed(2)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {direction === "horizontal" ? (
                        <>
                          <RangeControl
                            label="Start Y (%)"
                            value={typeof waveConfig.startY === "number" || typeof waveConfig.startY === "object" ? waveConfig.startY : defaultY}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(value) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "horizontal",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], startY: value };
                              updateConfig({ waves: newWaves });
                            }}
                            format={(v) => `${Math.round(v)}%`}
                            currentValue={currentValues?.waveValues?.[index]?.startY}
                          />
                          <RangeControl
                            label="End Y (%)"
                            value={typeof waveConfig.endY === "number" || typeof waveConfig.endY === "object" ? waveConfig.endY : defaultY}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(value) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "horizontal",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], endY: value };
                              updateConfig({ waves: newWaves });
                            }}
                            format={(v) => `${Math.round(v)}%`}
                            currentValue={currentValues?.waveValues?.[index]?.endY}
                          />
                        </>
                      ) : (
                        <>
                          <RangeControl
                            label="Start X (%)"
                            value={waveConfig.startX ?? defaultX}
                            min={0}
                            max={200}
                            step={1}
                            onChange={(value) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "vertical",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], startX: value };
                              updateConfig({ waves: newWaves });
                            }}
                            format={(v) => `${Math.round(v)}%`}
                            currentValue={currentValues?.waveValues?.[index]?.startX}
                          />
                          <RangeControl
                            label="End X (%)"
                            value={waveConfig.endX ?? defaultX}
                            min={0}
                            max={200}
                            step={1}
                            onChange={(value) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({ 
                                  startY: yPercent, 
                                  endY: yPercent, 
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: "vertical",
                                });
                              }
                              newWaves[index] = { ...newWaves[index], endX: value };
                              updateConfig({ waves: newWaves });
                            }}
                            format={(v) => `${Math.round(v)}%`}
                            currentValue={currentValues?.waveValues?.[index]?.endX}
                          />
                        </>
                      )}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="mb-2">
                          <label className="mb-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                            <input
                              type="checkbox"
                              checked={!!waveConfig.strokeWidthStops && waveConfig.strokeWidthStops.length > 0}
                              onChange={(e) => {
                                const newWaves = [...(config.waves || [])];
                                while (newWaves.length <= index) {
                                  const i = newWaves.length;
                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                  newWaves.push({
                                    startY: yPercent,
                                    endY: yPercent,
                                    startX: xPercent,
                                    endX: xPercent,
                                    inverted: false,
                                    direction: direction,
                                    strokeWidth: config.strokeWidth,
                                  });
                                }
                                if (e.target.checked) {
                                  const strokeWidthValue = typeof config.strokeWidth === "number" ? config.strokeWidth : (typeof config.strokeWidth === "object" ? (config.strokeWidth.min + config.strokeWidth.max) / 2 : 4);
                                  newWaves[index] = {
                                    ...newWaves[index],
                                    strokeWidthStops: [
                                      { width: 0, offset: 0 },
                                      { width: strokeWidthValue, offset: 50 },
                                      { width: 0, offset: 100 },
                                    ],
                                  };
                                } else {
                                  const { strokeWidthStops, ...rest } = newWaves[index];
                                  newWaves[index] = rest;
                                }
                                updateConfig({ waves: newWaves });
                              }}
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            Use Variable Stroke Width
                          </label>
                        </div>
                        {!waveConfig.strokeWidthStops || waveConfig.strokeWidthStops.length === 0 ? (
                          <RangeControl
                            label="Stroke Width"
                            value={waveConfig.strokeWidth ?? config.strokeWidth}
                            min={0}
                            max={50}
                            step={0.5}
                            onChange={(value) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({
                                  startY: yPercent,
                                  endY: yPercent,
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: direction,
                                });
                              }
                              newWaves[index] = { ...newWaves[index], strokeWidth: value };
                              updateConfig({ waves: newWaves });
                            }}
                            format={(v) => v.toFixed(1)}
                            currentValue={currentValues?.waveValues?.[index]?.strokeWidth}
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs text-gray-600 dark:text-gray-400">
                                Stroke Width Stops
                              </label>
                              <button
                                onClick={() => {
                                  const newWaves = [...(config.waves || [])];
                                  while (newWaves.length <= index) {
                                    const i = newWaves.length;
                                    const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                    const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                    newWaves.push({
                                      startY: yPercent,
                                      endY: yPercent,
                                      startX: xPercent,
                                      endX: xPercent,
                                      inverted: false,
                                      direction: direction,
                                    });
                                  }
                                  const newStops = [...(waveConfig.strokeWidthStops || [])];
                                  const lastStop = newStops[newStops.length - 1];
                                  newStops.push({
                                    width: lastStop?.width || 0,
                                    offset: Math.min(100, (lastStop?.offset || 0) + 10),
                                  });
                                  newStops.sort((a, b) => a.offset - b.offset);
                                  newWaves[index] = { ...newWaves[index], strokeWidthStops: newStops };
                                  updateConfig({ waves: newWaves });
                                }}
                                className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                              >
                                + Add Stop
                              </button>
                            </div>
                            {waveConfig.strokeWidthStops.map((stop, stopIndex) => (
                              <div
                                key={stopIndex}
                                className="rounded border border-gray-200 p-2 dark:border-gray-700"
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Stop {stopIndex + 1}
                                  </span>
                                  {waveConfig.strokeWidthStops && waveConfig.strokeWidthStops.length > 1 && (
                                    <button
                                      onClick={() => {
                                        const newWaves = [...(config.waves || [])];
                                        while (newWaves.length <= index) {
                                          const i = newWaves.length;
                                          const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                          newWaves.push({
                                            startY: yPercent,
                                            endY: yPercent,
                                            startX: xPercent,
                                            endX: xPercent,
                                            inverted: false,
                                            direction: direction,
                                          });
                                        }
                                        const newStops = (waveConfig.strokeWidthStops || []).filter(
                                          (_, i) => i !== stopIndex
                                        );
                                        newWaves[index] = {
                                          ...newWaves[index],
                                          strokeWidthStops: newStops.length > 0 ? newStops : undefined,
                                        };
                                        updateConfig({ waves: newWaves });
                                      }}
                                      className="text-red-500 hover:text-red-700 text-xs"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                                      Offset (%)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={stop.offset}
                                        onChange={(e) => {
                                          const newWaves = [...(config.waves || [])];
                                          while (newWaves.length <= index) {
                                            const i = newWaves.length;
                                            const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            newWaves.push({
                                              startY: yPercent,
                                              endY: yPercent,
                                              startX: xPercent,
                                              endX: xPercent,
                                              inverted: false,
                                              direction: direction,
                                            });
                                          }
                                          const newStops = [...(waveConfig.strokeWidthStops || [])];
                                          newStops[stopIndex].offset = parseFloat(e.target.value);
                                          newStops.sort((a, b) => a.offset - b.offset);
                                          newWaves[index] = { ...newWaves[index], strokeWidthStops: newStops };
                                          updateConfig({ waves: newWaves });
                                        }}
                                        className="flex-1"
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={stop.offset}
                                        onChange={(e) => {
                                          const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                          const newWaves = [...(config.waves || [])];
                                          while (newWaves.length <= index) {
                                            const i = newWaves.length;
                                            const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            newWaves.push({
                                              startY: yPercent,
                                              endY: yPercent,
                                              startX: xPercent,
                                              endX: xPercent,
                                              inverted: false,
                                              direction: direction,
                                            });
                                          }
                                          const newStops = [...(waveConfig.strokeWidthStops || [])];
                                          newStops[stopIndex].offset = val;
                                          newStops.sort((a, b) => a.offset - b.offset);
                                          newWaves[index] = { ...newWaves[index], strokeWidthStops: newStops };
                                          updateConfig({ waves: newWaves });
                                        }}
                                        className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                                      Width (px)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="range"
                                        min={0}
                                        max={50}
                                        step={0.5}
                                        value={stop.width}
                                        onChange={(e) => {
                                          const newWaves = [...(config.waves || [])];
                                          while (newWaves.length <= index) {
                                            const i = newWaves.length;
                                            const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            newWaves.push({
                                              startY: yPercent,
                                              endY: yPercent,
                                              startX: xPercent,
                                              endX: xPercent,
                                              inverted: false,
                                              direction: direction,
                                            });
                                          }
                                          const newStops = [...(waveConfig.strokeWidthStops || [])];
                                          newStops[stopIndex].width = parseFloat(e.target.value);
                                          newWaves[index] = { ...newWaves[index], strokeWidthStops: newStops };
                                          updateConfig({ waves: newWaves });
                                        }}
                                        className="flex-1"
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        max={50}
                                        step={0.5}
                                        value={stop.width}
                                        onChange={(e) => {
                                          const val = Math.max(0, Math.min(50, parseFloat(e.target.value) || 0));
                                          const newWaves = [...(config.waves || [])];
                                          while (newWaves.length <= index) {
                                            const i = newWaves.length;
                                            const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                            newWaves.push({
                                              startY: yPercent,
                                              endY: yPercent,
                                              startX: xPercent,
                                              endX: xPercent,
                                              inverted: false,
                                              direction: direction,
                                            });
                                          }
                                          const newStops = [...(waveConfig.strokeWidthStops || [])];
                                          newStops[stopIndex].width = val;
                                          newWaves[index] = { ...newWaves[index], strokeWidthStops: newStops };
                                          updateConfig({ waves: newWaves });
                                        }}
                                        className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="mb-2">
                          <label className="mb-2 block text-xs text-gray-600 dark:text-gray-400">
                            Blur Effect
                          </label>
                          <div className="space-y-2">
                            <select
                              value={waveConfig.blurType || "none"}
                              onChange={(e) => {
                                const newWaves = [...(config.waves || [])];
                                while (newWaves.length <= index) {
                                  const i = newWaves.length;
                                  const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                  const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                  newWaves.push({
                                    startY: yPercent,
                                    endY: yPercent,
                                    startX: xPercent,
                                    endX: xPercent,
                                    inverted: false,
                                    direction: direction,
                                    blurType: "none",
                                  });
                                }
                                const newType = e.target.value as "none" | "gaussian" | "radial";
                                const updates: any = {
                                  blurType: newType,
                                };
                                if (newType === "none") {
                                  updates.blurAmount = undefined;
                                  updates.radialBlur = undefined;
                                } else if (newType === "gaussian") {
                                  updates.blurAmount = newWaves[index].blurAmount || 5;
                                  updates.radialBlur = undefined;
                                } else if (newType === "radial") {
                                  updates.blurAmount = undefined;
                                  updates.radialBlur = newWaves[index].radialBlur || {
                                    centerX: 50,
                                    centerY: 50,
                                    radius: 50,
                                    intensity: 10,
                                  };
                                }
                                newWaves[index] = { ...newWaves[index], ...updates };
                                updateConfig({ waves: newWaves });
                              }}
                              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                              <option value="none">None</option>
                              <option value="gaussian">Gaussian Blur</option>
                              <option value="radial">Radial Blur</option>
                            </select>
                            {waveConfig.blurType && waveConfig.blurType !== "none" && (
                              <SliderControl
                                label="Blur Amount"
                                value={waveConfig.blurAmount || 5}
                                min={0}
                                max={50}
                                step={0.5}
                                onChange={(value) => {
                                  const newWaves = [...(config.waves || [])];
                                  while (newWaves.length <= index) {
                                    const i = newWaves.length;
                                    const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                    const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                    newWaves.push({
                                      startY: yPercent,
                                      endY: yPercent,
                                      startX: xPercent,
                                      endX: xPercent,
                                      inverted: false,
                                      direction: direction,
                                      blurType: waveConfig.blurType || "none",
                                    });
                                  }
                                  newWaves[index] = { ...newWaves[index], blurAmount: value };
                                  updateConfig({ waves: newWaves });
                                }}
                                format={(v) => v.toFixed(1)}
                              />
                            )}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <label className="mb-2 block text-xs text-gray-600 dark:text-gray-400">
                            Mask By Wave
                          </label>
                          <select
                            value={waveConfig.maskBy !== undefined ? waveConfig.maskBy : ""}
                            onChange={(e) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({
                                  startY: yPercent,
                                  endY: yPercent,
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: direction,
                                });
                              }
                              const maskValue = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                              if (maskValue !== undefined && (maskValue < 0 || maskValue >= config.waveCount || maskValue === index)) {
                                return;
                              }
                              newWaves[index] = { ...newWaves[index], maskBy: maskValue };
                              updateConfig({ waves: newWaves });
                            }}
                            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          >
                            <option value="">None</option>
                            {Array.from({ length: config.waveCount }).map((_, i) => {
                              if (i === index) return null;
                              return (
                                <option key={i} value={i}>
                                  Wave {i + 1}
                                </option>
                              );
                            })}
                          </select>
                          {waveConfig.maskBy !== undefined && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              This wave will only be visible where Wave {waveConfig.maskBy + 1} is visible.
                            </p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <label className="mb-2 block text-xs text-gray-600 dark:text-gray-400">
                            Anchor To Wave
                          </label>
                          <select
                            value={waveConfig.anchorTo !== undefined ? waveConfig.anchorTo : ""}
                            onChange={(e) => {
                              const newWaves = [...(config.waves || [])];
                              while (newWaves.length <= index) {
                                const i = newWaves.length;
                                const yPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                const xPercent = (i / (config.waveCount - 1 || 1)) * 100;
                                newWaves.push({
                                  startY: yPercent,
                                  endY: yPercent,
                                  startX: xPercent,
                                  endX: xPercent,
                                  inverted: false,
                                  direction: direction,
                                });
                              }
                              const anchorValue = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                              if (anchorValue !== undefined && (anchorValue < 0 || anchorValue >= config.waveCount || anchorValue === index)) {
                                return;
                              }
                              newWaves[index] = { ...newWaves[index], anchorTo: anchorValue };
                              updateConfig({ waves: newWaves });
                            }}
                            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          >
                            <option value="">None</option>
                            {Array.from({ length: config.waveCount }).map((_, i) => {
                              if (i === index) return null;
                              return (
                                <option key={i} value={i}>
                                  Wave {i + 1}
                                </option>
                              );
                            })}
                          </select>
                          {waveConfig.anchorTo !== undefined && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              This wave will have the same curvature as Wave {waveConfig.anchorTo + 1}.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </ControlSection>
        </div>
      </div>
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-500 bg-transparent transition-colors"
        style={{ zIndex: 10 }}
      />
    </div>
  );
}

