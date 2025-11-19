import { useEffect, useRef, useState } from "react";
import type { AnimatedValue } from "./WaveBackgroundControls";
import type { BezierEditorValue } from "./types";

export type { AnimatedValue, ValueRange } from "./WaveBackgroundControls";

interface UseAnimatedValuesOptions {
  speed: AnimatedValue;
  amplitude: AnimatedValue;
  frequency: AnimatedValue;
  waveAmplitude: AnimatedValue;
  strokeWidth?: AnimatedValue;
  floatSpeed?: number;
  waveCount?: number;
  paused?: boolean;
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
  waveCount = 5,
  paused = false,
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
  const waveCountRef = useRef(waveCount);

  speedRangeRef.current = speedRange;
  amplitudeRangeRef.current = amplitudeRange;
  frequencyRangeRef.current = frequencyRange;
  waveAmplitudeRangeRef.current = waveAmplitudeRange;
  wavesRef.current = waves;
  waveCountRef.current = waveCount;

  useEffect(() => {
    console.log("[useAnimatedValues] Effect - paused:", paused, "speedRange:", speedRangeRef.current);
    if (paused) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }

    let lastTime: number | null = null;
    let lastSetTimeValue = timeRef.current;

    const animate = (timestamp: DOMHighResTimeStamp) => {
      if (lastTime === null) {
        lastTime = timestamp;
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const delta = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      if (delta > 0) {
        const currentTimeValue = timeRef.current;
        const currentSpeed = typeof speedRangeRef.current === "number" 
          ? speedRangeRef.current 
          : getValueFromRange(speedRangeRef.current, currentTimeValue, floatSpeed);
        
        const newTime = timeRef.current + delta * currentSpeed;
        timeRef.current = newTime;
        
        const timeDiff = Math.abs(newTime - lastSetTimeValue);
        if (timeDiff > 0.0001) {
          setTime(newTime);
          lastSetTimeValue = newTime;
          if (Math.floor(newTime * 100) % 100 === 0) {
            console.log("[useAnimatedValues] setTime called:", newTime, "delta:", delta, "speed:", currentSpeed, "timeDiff:", timeDiff);
          }
        } else {
          if (Math.floor(newTime * 100) % 100 === 0) {
            console.log("[useAnimatedValues] setTime SKIPPED:", newTime, "timeDiff:", timeDiff, "< 0.0001");
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [floatSpeed, paused]);
  
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

  const computedWaves: BezierEditorValue[] = Array.from({ length: waveCountRef.current }, (_, index) => {
    const phase = (index / waveCountRef.current) * Math.PI * 2;
    const waveTime = time * currentFrequency + phase;

    const baseY = 0.5;
    const wave1 = Math.sin(waveTime) * currentAmplitude;
    const wave2 = Math.sin(waveTime * 1.5 + phase) * currentAmplitude;

    const c1x = 0.25;
    const c1y = baseY + wave1;
    const c2x = 0.75;
    const c2y = baseY + wave2;

    return [c1x, c1y, c2x, c2y] as BezierEditorValue;
  });
  
  if (Math.floor(time * 10) % 10 === 0 && time > 0) {
    console.log("[useAnimatedValues] time:", time, "frequency:", currentFrequency, "waveTime:", time * currentFrequency, "wave1:", computedWaves[0]?.[1], "wave2:", computedWaves[0]?.[3]);
  }

  return {
    speed: currentSpeed,
    amplitude: currentAmplitude,
    frequency: currentFrequency,
    waveAmplitude: currentWaveAmplitude,
    strokeWidth: currentStrokeWidth,
    waveValues,
    waves: computedWaves,
  };
}

