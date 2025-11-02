import React, { useMemo } from "react";
import { Curve } from "./Curve";
import { Position } from "./types";
import { useAnimatedValues } from "./useAnimatedValues";
import type { FillColor, GradientConfig, WaveConfig, StrokeWidthStop, AnimatedValue } from "./WaveBackgroundControls";

interface WaveBackgroundProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  waveCount?: number;
  colors?: string[];
  fillColors?: FillColor[];
  strokeWidth?: AnimatedValue;
  strokeWidthStops?: StrokeWidthStop[];
  speed?: AnimatedValue;
  amplitude?: AnimatedValue;
  frequency?: AnimatedValue;
  position?: Position;
  waveAmplitude?: AnimatedValue;
  showFill?: boolean;
  floatSpeed?: number;
  waves?: WaveConfig[];
  backgroundColor?: string;
  waveOpacity?: number;
  paused?: boolean;
  onAnimatedValuesChange?: (values: {
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
  }) => void;
}

export const WaveBackground: React.FC<WaveBackgroundProps> = ({
  className,
  width = "100%",
  height = "100%",
  waveCount = 5,
  colors = ["currentColor"],
  fillColors,
  strokeWidth = 3,
  strokeWidthStops,
  speed = 0.001,
  amplitude = 0.1,
  frequency = 1,
  position: _position,
  waveAmplitude = 1.25,
  showFill = true,
  floatSpeed = 0.1,
  waves: waveConfigs,
  backgroundColor,
  waveOpacity = 1,
  paused = false,
  onAnimatedValuesChange,
}) => {
  const animatedValues = useAnimatedValues({
    speed: typeof speed === "object" ? speed : speed,
    amplitude: typeof amplitude === "object" ? amplitude : amplitude,
    frequency: typeof frequency === "object" ? frequency : frequency,
    waveAmplitude: typeof waveAmplitude === "object" ? waveAmplitude : waveAmplitude,
    strokeWidth: strokeWidth,
    floatSpeed: floatSpeed,
    waveCount: waveCount,
    paused: paused,
    waves: waveConfigs?.map(w => ({
      startY: w.startY,
      endY: w.endY,
      startX: w.startX,
      endX: w.endX,
      strokeWidth: w.strokeWidth,
    })),
  });
  
  if (animatedValues.waves.length > 0 && Math.floor((animatedValues.waves[0]?.[1] || 0) * 1000) % 100 === 0) {
    console.log("[WaveBackground] Render - waves[0]:", animatedValues.waves[0], "speed:", typeof speed === "number" ? speed : animatedValues.speed);
  }

  const currentSpeed = typeof speed === "number" ? speed : animatedValues.speed;
  const currentAmplitude = typeof amplitude === "number" ? amplitude : animatedValues.amplitude;
  const currentFrequency = typeof frequency === "number" ? frequency : animatedValues.frequency;
  const currentWaveAmplitude = typeof waveAmplitude === "number" ? waveAmplitude : animatedValues.waveAmplitude;
  const currentStrokeWidth = animatedValues.strokeWidth !== undefined ? animatedValues.strokeWidth : (typeof strokeWidth === "number" ? strokeWidth : undefined);

  const previousValuesRef = React.useRef<{
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
  }>();

  React.useEffect(() => {
    if (!onAnimatedValuesChange) return;

    const newValues = {
      speed: currentSpeed,
      amplitude: currentAmplitude,
      frequency: currentFrequency,
      waveAmplitude: currentWaveAmplitude,
      strokeWidth: currentStrokeWidth,
      waveValues: animatedValues.waveValues,
    };

    const prev = previousValuesRef.current;
    if (
      !prev ||
      prev.speed !== newValues.speed ||
      prev.amplitude !== newValues.amplitude ||
      prev.frequency !== newValues.frequency ||
      prev.waveAmplitude !== newValues.waveAmplitude ||
      prev.strokeWidth !== newValues.strokeWidth ||
      prev.waveValues?.length !== newValues.waveValues?.length ||
      (newValues.waveValues && prev.waveValues && newValues.waveValues.some((val, idx) => {
        const prevVal = prev.waveValues?.[idx];
        return !prevVal ||
          prevVal.startY !== val.startY ||
          prevVal.endY !== val.endY ||
          prevVal.startX !== val.startX ||
          prevVal.endX !== val.endX ||
          prevVal.strokeWidth !== val.strokeWidth;
      }))
    ) {
      previousValuesRef.current = newValues;
      onAnimatedValuesChange(newValues);
    }
  }, [onAnimatedValuesChange, currentSpeed, currentAmplitude, currentFrequency, currentWaveAmplitude, currentStrokeWidth, animatedValues.waveValues]);

  const waves = animatedValues.waves || [];

  const svgViewBox = useMemo(() => {
    return "0 0 1000 1000";
  }, []);

  const wavePositionsRef = React.useRef<Position[]>([]);
  const wavePositionsKeysRef = React.useRef<string>("");
  const wavePositions = useMemo(() => {
    const animatedWaveValues = animatedValues.waveValues;
    const positionsKey = `${waves.length}-${animatedWaveValues?.map(w => 
      w ? `${w.startY ?? ''},${w.endY ?? ''},${w.startX ?? ''},${w.endX ?? ''}` : ''
    ).join('|')}`;
    
    if (positionsKey === wavePositionsKeysRef.current && wavePositionsRef.current.length === waves.length) {
      return wavePositionsRef.current;
    }
    
    const newPositions: Position[] = [];
    waves.forEach((_, index) => {
      const waveConfig = waveConfigs?.[index];
      const direction = waveConfig?.direction || "horizontal";
      const animatedWave = animatedWaveValues?.[index];
      
      let position: Position;
      
      if (direction === "vertical") {
        let startX: number;
        let endX: number;
        
        if (animatedWave?.startX !== undefined && animatedWave.endX !== undefined) {
          startX = (animatedWave.startX / 100) * 1000;
          endX = (animatedWave.endX / 100) * 1000;
        } else if (waveConfig && waveConfig.startX !== undefined && waveConfig.endX !== undefined) {
          const startXVal = typeof waveConfig.startX === "number" ? waveConfig.startX : (waveConfig.startX.min + waveConfig.startX.max) / 2;
          const endXVal = typeof waveConfig.endX === "number" ? waveConfig.endX : (waveConfig.endX.min + waveConfig.endX.max) / 2;
          startX = (startXVal / 100) * 1000;
          endX = (endXVal / 100) * 1000;
        } else {
          const xPercent = index / (waveCount - 1 || 1);
          startX = xPercent * 1000;
          endX = startX;
        }
        
        position = {
          x: [startX, endX] as [number, number],
          y: [0, 1000] as [number, number],
        };
      } else {
        let startY: number;
        let endY: number;
        
        if (animatedWave?.startY !== undefined && animatedWave.endY !== undefined) {
          startY = (animatedWave.startY / 100) * 1000;
          endY = (animatedWave.endY / 100) * 1000;
        } else if (waveConfig) {
          const startYVal = typeof waveConfig.startY === "number" ? waveConfig.startY : (waveConfig.startY.min + waveConfig.startY.max) / 2;
          const endYVal = typeof waveConfig.endY === "number" ? waveConfig.endY : (waveConfig.endY.min + waveConfig.endY.max) / 2;
          startY = (startYVal / 100) * 1000;
          endY = (endYVal / 100) * 1000;
        } else {
          const yPercent = index / (waveCount - 1 || 1);
          startY = yPercent * 1000;
          endY = startY;
        }
        
        position = {
          x: [0, 1000] as [number, number],
          y: [startY, endY] as [number, number],
        };
      }
      
      newPositions.push(position);
    });
    
    wavePositionsRef.current = newPositions;
    wavePositionsKeysRef.current = positionsKey;
    return newPositions;
  }, [waves, waveCount, waveConfigs, animatedValues.waveValues]);

  const gradients = useMemo(() => {
    const allGradients: Array<{ id: string; config: GradientConfig; direction: "vertical" | "horizontal" }> = [];
    
    if (fillColors) {
      fillColors.forEach((fill, index) => {
        if (typeof fill === "object" && fill !== null && "stops" in fill) {
          const gradientId = `gradient-global-fill-${index}`;
          const direction: "vertical" | "horizontal" = fill.direction || "vertical";
          allGradients.push({
            id: gradientId,
            config: fill,
            direction,
          });
        }
      });
    }
    
    if (waveConfigs) {
      waveConfigs.forEach((waveConfig, waveIndex) => {
        if (waveConfig?.fillColor && typeof waveConfig.fillColor === "object" && "stops" in waveConfig.fillColor) {
          const gradientId = `gradient-wave-fill-${waveIndex}`;
          const direction: "vertical" | "horizontal" = waveConfig.fillColor.direction || "vertical";
          allGradients.push({
            id: gradientId,
            config: waveConfig.fillColor,
            direction,
          });
        }
        if (waveConfig?.color && typeof waveConfig.color === "object" && "stops" in waveConfig.color) {
          const gradientId = `gradient-wave-line-${waveIndex}`;
          const direction: "vertical" | "horizontal" = waveConfig.color.direction || "vertical";
          allGradients.push({
            id: gradientId,
            config: waveConfig.color,
            direction,
          });
        }
      });
    }
    
    return allGradients;
  }, [fillColors, waveConfigs]);

  const bgColor = useMemo(() => {
    if (!backgroundColor) return undefined;
    if (backgroundColor.startsWith("#")) {
      return backgroundColor;
    }
    return backgroundColor;
  }, [backgroundColor]);

  const maskWaves = useMemo(() => {
    if (!waveConfigs) return [];
    const maskIndices = new Set<number>();
    waveConfigs.forEach((config, index) => {
      if (config.maskBy !== undefined && config.maskBy >= 0 && config.maskBy < waveConfigs.length) {
        maskIndices.add(config.maskBy);
      }
    });
    return Array.from(maskIndices);
  }, [waveConfigs]);

  const maskPaths = useMemo(() => {
    return maskWaves.map((maskIndex) => {
      if (maskIndex < 0 || maskIndex >= waves.length) return null;
      const maskWave = waves[maskIndex];
      const maskWaveConfig = waveConfigs?.[maskIndex];
      const maskDirection = maskWaveConfig?.direction || "horizontal";
      const maskInverted = maskWaveConfig?.inverted || false;
      const maskPosition = wavePositions[maskIndex];
      
      const [x0, x1] = maskPosition.x;
      const [y0, y1] = maskPosition.y;
      const xRange = x1 - x0;
      const yRange = y1 - y0;
      
      if (maskDirection === "vertical") {
        const startX = x0;
        const endX = x1;
        const startY = y0;
        const endY = y1;
        const fillTargetX = maskInverted ? 0 : 1000;
        
        const waveAmplitudePixels = 1000 * currentWaveAmplitude;
        const baseX = (startX + endX) / 2;
        
        const cy1 = y0 + maskWave[0] * yRange;
        const cx1 = baseX + (maskWave[1] - 0.5) * waveAmplitudePixels;
        const cy2 = y0 + maskWave[2] * yRange;
        const cx2 = baseX + (maskWave[3] - 0.5) * waveAmplitudePixels;
        
        const curvePath = `M${startX},${startY} C${cx1},${cy1} ${cx2},${cy2} ${endX},${endY}`;
        return `${curvePath} L${fillTargetX},${endY} L${fillTargetX},${startY} Z`;
      } else {
        const startX = x0;
        const endX = x1;
        const startY = y0;
        const endY = y1;
        const fillTargetY = maskInverted ? 0 : 1000;
        
        const waveAmplitudePixels = 1000 * currentWaveAmplitude;
        const baseY = (startY + endY) / 2;
        
        const cx1 = x0 + maskWave[0] * xRange;
        const cy1 = baseY + (maskWave[1] - 0.5) * waveAmplitudePixels;
        const cx2 = x0 + maskWave[2] * xRange;
        const cy2 = baseY + (maskWave[3] - 0.5) * waveAmplitudePixels;
        
        const curvePath = `M${startX},${startY} C${cx1},${cy1} ${cx2},${cy2} ${endX},${endY}`;
        return `${curvePath} L${endX},${fillTargetY} L${startX},${fillTargetY} Z`;
      }
    });
  }, [maskWaves, waves, waveConfigs, wavePositions, currentWaveAmplitude]);

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={svgViewBox}
      preserveAspectRatio="none"
      style={{ display: "block", willChange: "transform", transform: "translateZ(0)" }}
    >
      {bgColor && (
        <rect
          x="0"
          y="0"
          width="1000"
          height="1000"
          fill={bgColor}
        />
      )}
      <defs>
        {gradients.map(({ id, config, direction }) => (
          <linearGradient
            key={id}
            id={id}
            x1={direction === "horizontal" ? "0%" : "0%"}
            y1={direction === "horizontal" ? "0%" : "0%"}
            x2={direction === "horizontal" ? "100%" : "0%"}
            y2={direction === "horizontal" ? "0%" : "100%"}
          >
            {config.stops.map((stop, stopIndex) => (
              <stop
                key={stopIndex}
                offset={`${stop.offset}%`}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
        ))}
        {waveConfigs?.map((waveConfig, index) => {
          if (!waveConfig.blurType || waveConfig.blurType === "none") {
            return null;
          }
          const filterId = `blur-filter-${index}`;
          
          if (waveConfig.blurType === "gaussian") {
            if (!waveConfig.blurAmount) return null;
            const blurStdDev = waveConfig.blurAmount;
            // For Gaussian blur, we need padding of at least 3x stdDeviation to prevent clipping
            // The SVG viewBox is 1000x1000, so calculate padding in user space
            const padding = Math.max(blurStdDev * 4, 50);
            return (
              <filter 
                key={filterId} 
                id={filterId}
                x={-padding}
                y={-padding}
                width={1000 + padding * 2}
                height={1000 + padding * 2}
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
                primitiveUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation={blurStdDev} edgeMode="wrap" />
              </filter>
            );
          } else if (waveConfig.blurType === "radial") {
            const radialConfig = waveConfig.radialBlur || {
              centerX: 50,
              centerY: 50,
              radius: 50,
              intensity: 10,
            };
            const _centerX = (radialConfig.centerX / 100) * 1000;
            const _centerY = (radialConfig.centerY / 100) * 1000;
            const _radius = (radialConfig.radius / 100) * Math.sqrt(1000 * 1000 + 1000 * 1000);
            const intensity = radialConfig.intensity;
            
            return (
              <filter key={filterId} id={filterId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={intensity} />
                <feComponentTransfer>
                  <feFuncA type="discrete" tableValues="0 0.5 1 0.5 0" />
                </feComponentTransfer>
              </filter>
            );
          }
          return null;
        })}
        {maskWaves.map((maskIndex, idx) => {
          const maskId = `wave-mask-${maskIndex}`;
          const maskPath = maskPaths[idx];
          if (!maskPath) return null;
          
          return (
            <mask key={maskId} id={maskId} maskUnits="userSpaceOnUse">
              <rect width="1000" height="1000" fill="black" />
              <path
                d={maskPath}
                fill="white"
              />
            </mask>
          );
        })}
      </defs>
      <g transform="translate(500, 500) scale(1.1) translate(-500, -500)" style={{ willChange: "transform" }}>
        {useMemo(() => waves.map((wave, index) => {
        const waveConfig = waveConfigs?.[index];
        if (waveConfig?.hidden) {
          return null;
        }
        
        const colorConfig = waveConfig?.color ?? colors[index % colors.length];
        const fill = waveConfig?.fillColor ?? (fillColors
          ? fillColors[index % fillColors.length]
          : (typeof colorConfig === "string" ? colorConfig : undefined));
        
        let colorValue: string;
        if (typeof colorConfig === "string") {
          colorValue = colorConfig;
        } else if (colorConfig && typeof colorConfig === "object") {
          if ("stops" in colorConfig) {
            const gradientId = `gradient-wave-line-${index}`;
            colorValue = `url(#${gradientId})`;
          } else if ("color" in colorConfig) {
            colorValue = colorConfig.color;
          } else {
            colorValue = colorConfig as unknown as string;
          }
        } else {
          colorValue = colorConfig as unknown as string;
        }
        
        let fillValue: string;
        let fillOpacity: number | undefined;
        
        if (typeof fill === "string") {
          fillValue = fill;
        } else if (fill && typeof fill === "object") {
          if ("stops" in fill) {
            let gradientId: string;
            if (waveConfig?.fillColor && typeof waveConfig.fillColor === "object" && "stops" in waveConfig.fillColor) {
              gradientId = `gradient-wave-fill-${index}`;
            } else {
              const globalFillIndex = fillColors ? fillColors.findIndex(f => f === fill) : -1;
              gradientId = globalFillIndex >= 0 ? `gradient-global-fill-${globalFillIndex}` : `gradient-global-fill-${index % (fillColors?.length || 1)}`;
            }
            fillValue = `url(#${gradientId})`;
            fillOpacity = fill.opacity;
          } else if ("color" in fill) {
            fillValue = fill.color;
            fillOpacity = fill.opacity;
          } else {
            fillValue = fill as unknown as string;
          }
        } else {
          fillValue = fill as unknown as string;
        }
        
        const effectiveOpacity = fillOpacity !== undefined 
          ? fillOpacity * waveOpacity 
          : waveOpacity;
        
        const inverted = waveConfig?.inverted || false;
        const direction = waveConfig?.direction || "horizontal";
        const animatedWave = animatedValues.waveValues?.[index];
        
        const anchorIndex = waveConfig?.anchorTo;
        const anchorWave = anchorIndex !== undefined && anchorIndex >= 0 && anchorIndex < waves.length
          ? waves[anchorIndex]
          : null;
        
        const waveValue = anchorWave || wave;
        
        let waveStrokeWidth: number;
        if (animatedWave?.strokeWidth !== undefined) {
          waveStrokeWidth = animatedWave.strokeWidth;
        } else if (waveConfig?.strokeWidth !== undefined) {
          waveStrokeWidth = typeof waveConfig.strokeWidth === "number" ? waveConfig.strokeWidth : (waveConfig.strokeWidth.min + waveConfig.strokeWidth.max) / 2;
        } else {
          waveStrokeWidth = currentStrokeWidth ?? (typeof strokeWidth === "number" ? strokeWidth : 3);
        }
        
        const waveStrokeWidthStops = waveConfig?.strokeWidthStops ?? strokeWidthStops;
        
        const blurType = waveConfig?.blurType || "none";
        const blurAmount = waveConfig?.blurAmount;
        const filterId = (blurType !== "none" && blurAmount) ? `blur-filter-${index}` : undefined;
        const maskId = waveConfig?.maskBy !== undefined && waveConfig.maskBy >= 0 && waveConfig.maskBy < waves.length
          ? `wave-mask-${waveConfig.maskBy}`
          : undefined;

        return (
          <Curve
            key={index}
            color={colorValue}
            fillColor={fillValue}
            width={waveStrokeWidth}
            strokeWidthStops={waveStrokeWidthStops}
            value={waveValue}
            position={wavePositions[index]}
            waveAmplitude={currentWaveAmplitude}
            showFill={showFill}
            inverted={inverted}
            direction={direction}
            blurType={blurType}
            blurAmount={blurAmount}
            filterId={filterId}
            opacity={effectiveOpacity}
            maskId={maskId}
          />
        );
      }).filter(Boolean), [waves, colors, fillColors, waveConfigs, animatedValues.waveValues, wavePositions, currentWaveAmplitude, currentStrokeWidth, strokeWidth, strokeWidthStops, showFill, waveOpacity])}
      </g>
    </svg>
  );
};

