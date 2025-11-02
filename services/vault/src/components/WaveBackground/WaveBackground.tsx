import React, { useMemo } from "react";
import { Curve } from "./Curve";
import { Position } from "./types";
import { useWaveAnimation } from "./useWaveAnimation";
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
  onAnimatedValuesChange,
}) => {
  const animatedValues = useAnimatedValues({
    speed: typeof speed === "object" ? speed : speed,
    amplitude: typeof amplitude === "object" ? amplitude : amplitude,
    frequency: typeof frequency === "object" ? frequency : frequency,
    waveAmplitude: typeof waveAmplitude === "object" ? waveAmplitude : waveAmplitude,
    strokeWidth: strokeWidth,
    floatSpeed: floatSpeed,
    waves: waveConfigs?.map(w => ({
      startY: w.startY,
      endY: w.endY,
      startX: w.startX,
      endX: w.endX,
      strokeWidth: w.strokeWidth,
    })),
  });

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
      JSON.stringify(prev.waveValues) !== JSON.stringify(newValues.waveValues)
    ) {
      previousValuesRef.current = newValues;
      onAnimatedValuesChange(newValues);
    }
  }, [onAnimatedValuesChange, currentSpeed, currentAmplitude, currentFrequency, currentWaveAmplitude, currentStrokeWidth, animatedValues.waveValues]);

  const waves = useWaveAnimation({
    waveCount,
    speed: currentSpeed,
    amplitude: currentAmplitude,
    frequency: currentFrequency,
  });

  const svgViewBox = useMemo(() => {
    return "0 0 1000 1000";
  }, []);

  const wavePositions = useMemo(() => {
    return waves.map((_, index) => {
      const waveConfig = waveConfigs?.[index];
      const direction = waveConfig?.direction || "horizontal";
      const animatedWave = animatedValues.waveValues?.[index];
      
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
        
        return {
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
        
        return {
          x: [0, 1000] as [number, number],
          y: [startY, endY] as [number, number],
        };
      }
    });
  }, [waves, waveCount, waveConfigs, animatedValues.waveValues]);

  const gradients = useMemo(() => {
    if (!fillColors) return [];
    
    return fillColors.map((fill, index) => {
      if (typeof fill === "string") return null;
      
      const gradientId = `gradient-${index}`;
      const direction: "vertical" | "horizontal" = fill.direction || "vertical";
      
      return {
        id: gradientId,
        config: fill,
        direction,
      };
    }).filter((g): g is { id: string; config: GradientConfig; direction: "vertical" | "horizontal" } => g !== null);
  }, [fillColors]);

  const bgColor = useMemo(() => {
    if (!backgroundColor) return undefined;
    if (backgroundColor.startsWith("#")) {
      return backgroundColor;
    }
    return backgroundColor;
  }, [backgroundColor]);

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={svgViewBox}
      preserveAspectRatio="none"
      style={{ display: "block" }}
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
            return (
              <filter key={filterId} id={filterId}>
                <feGaussianBlur stdDeviation={blurStdDev} />
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
      </defs>
      <g transform="translate(500, 500) scale(1.1) translate(-500, -500)">
        {waves.map((wave, index) => {
        const color = colors[index % colors.length];
        const fill = fillColors
          ? fillColors[index % fillColors.length]
          : color;
        
        let fillValue: string;
        if (typeof fill === "string") {
          fillValue = fill;
        } else {
          const gradientId = `gradient-${index}`;
          fillValue = `url(#${gradientId})`;
        }
        
        const waveConfig = waveConfigs?.[index];
        const inverted = waveConfig?.inverted || false;
        const direction = waveConfig?.direction || "horizontal";
        const animatedWave = animatedValues.waveValues?.[index];
        
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

        return (
          <Curve
            key={index}
            color={color}
            fillColor={fillValue}
            width={waveStrokeWidth}
            strokeWidthStops={waveStrokeWidthStops}
            value={wave}
            position={wavePositions[index]}
            waveAmplitude={currentWaveAmplitude}
            showFill={showFill}
            inverted={inverted}
            direction={direction}
            blurType={blurType}
            blurAmount={blurAmount}
            filterId={filterId}
            opacity={waveOpacity}
          />
        );
      })}
      </g>
    </svg>
  );
};

