import type { WaveBackgroundConfig, AnimatedValue, ValueRange, FillColor, GradientConfig, WaveConfig } from "./WaveBackgroundControls";

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAnimatedValue(min: number, max: number, useRange: boolean = Math.random() > 0.7): AnimatedValue {
  if (useRange) {
    const val1 = randomBetween(min, max);
    const val2 = randomBetween(min, max);
    return {
      min: Math.min(val1, val2),
      max: Math.max(val1, val2),
    } as ValueRange;
  }
  return randomBetween(min, max);
}

function randomColor(): string {
  const r = randomInt(0, 255);
  const g = randomInt(0, 255);
  const b = randomInt(0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
}

function randomRgbaColor(alpha: number = randomBetween(0.2, 0.6)): string {
  const r = randomInt(0, 255);
  const g = randomInt(0, 255);
  const b = randomInt(0, 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function randomGradient(): FillColor {
  const useGradient = Math.random() > 0.5;
  if (useGradient) {
    const stopCount = randomInt(2, 4);
    const stops = Array.from({ length: stopCount }, (_, i) => {
      const offset = i === 0 ? 0 : i === stopCount - 1 ? 100 : randomBetween(20, 80);
      const alpha = randomBetween(0.2, 0.6);
      return {
        color: randomRgbaColor(alpha),
        offset: Math.round(offset),
      };
    }).sort((a, b) => a.offset - b.offset);
    
    return {
      stops,
      direction: Math.random() > 0.5 ? "vertical" : "horizontal",
    } as GradientConfig;
  }
  return randomRgbaColor();
}

export function randomizeConfig(currentConfig: WaveBackgroundConfig): WaveBackgroundConfig {
  const waveCount = randomInt(3, 8);
  
  const colors = Array.from({ length: randomInt(2, 5) }, () => randomColor());
  const fillColors = Array.from({ length: randomInt(2, 5) }, () => randomGradient());
  
  const waves: WaveConfig[] = Array.from({ length: waveCount }, (_, index) => {
    const direction = Math.random() > 0.5 ? "horizontal" : "vertical";
    const defaultY = (index / (waveCount - 1 || 1)) * 100;
    const defaultX = (index / (waveCount - 1 || 1)) * 100;
    
    if (direction === "horizontal") {
      return {
        startY: randomAnimatedValue(0, 100, Math.random() > 0.7),
        endY: randomAnimatedValue(0, 100, Math.random() > 0.7),
        inverted: Math.random() > 0.5,
        direction: "horizontal",
        strokeWidth: randomAnimatedValue(0.5, 15, Math.random() > 0.7),
        blurType: Math.random() > 0.7 ? (Math.random() > 0.5 ? "gaussian" : "radial") : "none",
        blurAmount: Math.random() > 0.7 ? randomBetween(1, 30) : undefined,
      };
    } else {
      return {
        startY: defaultY,
        endY: defaultY,
        startX: randomAnimatedValue(0, 100, Math.random() > 0.7),
        endX: randomAnimatedValue(0, 100, Math.random() > 0.7),
        inverted: Math.random() > 0.5,
        direction: "vertical",
        strokeWidth: randomAnimatedValue(0.5, 15, Math.random() > 0.7),
        blurType: Math.random() > 0.7 ? (Math.random() > 0.5 ? "gaussian" : "radial") : "none",
        blurAmount: Math.random() > 0.7 ? randomBetween(1, 30) : undefined,
      };
    }
  });

  return {
    speed: randomAnimatedValue(0.00001, 0.001, Math.random() > 0.7),
    amplitude: randomAnimatedValue(0.1, 1, Math.random() > 0.7),
    frequency: randomAnimatedValue(0.5, 3, Math.random() > 0.7),
    waveAmplitude: randomAnimatedValue(0.1, 3, Math.random() > 0.7),
    strokeWidth: randomAnimatedValue(0.5, 15, Math.random() > 0.7),
    waveCount,
    showFill: Math.random() > 0.2,
    colors,
    fillColors,
    floatSpeed: randomBetween(0.01, 1),
    waves,
    backgroundColor: Math.random() > 0.3 ? randomColor() : currentConfig.backgroundColor,
    waveOpacity: randomBetween(0.3, 1),
  };
}

