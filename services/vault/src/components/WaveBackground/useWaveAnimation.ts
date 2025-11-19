import { useEffect, useRef, useState } from "react";
import { BezierEditorValue } from "./types";

interface UseWaveAnimationOptions {
  waveCount: number;
  speed?: number;
  amplitude?: number;
  frequency?: number;
}

export function useWaveAnimation({
  waveCount,
  speed = 0.001,
  amplitude = 0.1,
  frequency = 1,
}: UseWaveAnimationOptions) {
  const [time, setTime] = useState(0);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;

      setTime((prevTime) => prevTime + delta * speed);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [speed]);

  const waves = Array.from({ length: waveCount }, (_, index) => {
    const phase = (index / waveCount) * Math.PI * 2;
    const waveTime = time * frequency + phase;

    // BASE Y: Center point (0.5) - waves oscillate around this
    const baseY = 0.5;
    
    // WAVE OFFSETS: These create the animated wave effect
    // wave1: Controls the first control point's vertical position
    // wave2: Controls the second control point's vertical position
    //   - amplitude: Range of oscillation (0.1 = small waves, 0.5 = large waves)
    //   - Math.sin(waveTime * 1.5 + phase): Different frequency for wave2 creates varied patterns
    const wave1 = Math.sin(waveTime) * amplitude;
    const wave2 = Math.sin(waveTime * 1.5 + phase) * amplitude;

    // CONTROL POINT 1 (left side of wave)
    // c1x: Horizontal position (0.0 = start, 1.0 = end)
    //   - 0.25 = 25% from left edge - tweak to move curvature point left/right
    // c1y: Vertical position (0.0 = top, 1.0 = bottom, 0.5 = center line)
    //   - baseY (0.5) + wave1 = oscillates around center
    //   - Range: 0.5 ± amplitude (e.g., 0.5 ± 0.5 = 0.0 to 1.0 for full range)
    const c1x = 0.25;
    const c1y = baseY + wave1;

    // CONTROL POINT 2 (right side of wave)
    // c2x: Horizontal position
    //   - 0.75 = 75% from left edge - tweak to move curvature point left/right
    // c2y: Vertical position
    //   - Different frequency (waveTime * 1.5) creates varied wave patterns
    const c2x = 0.75;
    const c2y = baseY + wave2;

    // TO TWEAK CURVATURE:
    // 1. Change c1x and c2x (0-1) to move where the curve points are horizontally
    //    - Closer to 0.5 = curves in the middle, closer to edges = curves at start/end
    // 2. Adjust the multiplier on waveTime (currently 1.5 for wave2) for different patterns
    //    - Try 1.2, 1.8, 2.0 for different wave frequencies
    // 3. Change amplitude prop to control how far waves deviate from center
    // 4. Modify the baseY if you want waves centered at a different point
    return [c1x, c1y, c2x, c2y] as BezierEditorValue;
  });

  return waves;
}

