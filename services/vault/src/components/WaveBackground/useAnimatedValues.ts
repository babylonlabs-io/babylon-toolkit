import { useEffect, useRef, useState } from "react";
import type { AnimatedValue } from "./WaveBackgroundControls";

export type { AnimatedValue, ValueRange } from "./WaveBackgroundControls";

interface UseAnimatedValuesOptions {
  speed: AnimatedValue;
  amplitude: AnimatedValue;
  frequency: AnimatedValue;
  waveAmplitude: AnimatedValue;
  strokeWidth?: AnimatedValue;
  floatSpeed?: number;
  waves?: Array<{
    startY?: AnimatedValue;
    endY?: AnimatedValue;
    startX?: AnimatedValue;
    endX?: AnimatedValue;
    strokeWidth?: AnimatedValue;
  }>;
}

function getValueFromRange(value: AnimatedValue, time: number, floatSpeed: number, phase: number = 0): number {
  if (typeof value === "number") {
    return value;
  }
  const t = (Math.sin(time * floatSpeed + phase) + 1) / 2;
  return value.min + (value.max - value.min) * t;
}

export function useAnimatedValues({
  speed: speedRange,
  amplitude: amplitudeRange,
  frequency: frequencyRange,
  waveAmplitude: waveAmplitudeRange,
  strokeWidth: strokeWidthRange,
  floatSpeed = 0.1,
  waves,
}: UseAnimatedValuesOptions) {
  const [time, setTime] = useState(0);
  const animationFrameRef = useRef<number>();
  const timeRef = useRef(0);
  const speedRangeRef = useRef(speedRange);
  const amplitudeRangeRef = useRef(amplitudeRange);
  const frequencyRangeRef = useRef(frequencyRange);
  const waveAmplitudeRangeRef = useRef(waveAmplitudeRange);
  const wavesRef = useRef(waves);

  speedRangeRef.current = speedRange;
  amplitudeRangeRef.current = amplitudeRange;
  frequencyRangeRef.current = frequencyRange;
  waveAmplitudeRangeRef.current = waveAmplitudeRange;
  wavesRef.current = waves;

  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;

      const currentTimeValue = timeRef.current;
      const currentSpeed = typeof speedRangeRef.current === "number" 
        ? speedRangeRef.current 
        : getValueFromRange(speedRangeRef.current, currentTimeValue, floatSpeed);
      
      timeRef.current += delta * currentSpeed;
      setTime(timeRef.current);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [floatSpeed]);

  const currentSpeed = typeof speedRange === "number" ? speedRange : getValueFromRange(speedRange, time, floatSpeed);
  const currentAmplitude = typeof amplitudeRange === "number" ? amplitudeRange : getValueFromRange(amplitudeRange, time, floatSpeed);
  const currentFrequency = typeof frequencyRange === "number" ? frequencyRange : getValueFromRange(frequencyRange, time, floatSpeed);
  const currentWaveAmplitude = typeof waveAmplitudeRange === "number" ? waveAmplitudeRange : getValueFromRange(waveAmplitudeRange, time, floatSpeed);
  const currentStrokeWidth = strokeWidthRange ? (typeof strokeWidthRange === "number" ? strokeWidthRange : getValueFromRange(strokeWidthRange, time, floatSpeed)) : undefined;

  const waveValues = waves?.map((wave, index) => ({
    startY: wave.startY ? getValueFromRange(wave.startY, time, floatSpeed, index * 0.5) : undefined,
    endY: wave.endY ? getValueFromRange(wave.endY, time, floatSpeed, index * 0.5 + 0.25) : undefined,
    startX: wave.startX ? getValueFromRange(wave.startX, time, floatSpeed, index * 0.5) : undefined,
    endX: wave.endX ? getValueFromRange(wave.endX, time, floatSpeed, index * 0.5 + 0.25) : undefined,
    strokeWidth: wave.strokeWidth ? getValueFromRange(wave.strokeWidth, time, floatSpeed, index * 0.3) : undefined,
  }));

  return {
    speed: currentSpeed,
    amplitude: currentAmplitude,
    frequency: currentFrequency,
    waveAmplitude: currentWaveAmplitude,
    strokeWidth: currentStrokeWidth,
    waveValues,
  };
}

