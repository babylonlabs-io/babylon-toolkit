import React, { memo, useMemo } from "react";
import { BezierEditorValue } from "./types";
import { Position, usePosition } from "./usePosition";
import type { StrokeWidthStop, MiddlePoint } from "./WaveBackgroundControls";

interface CurveProps {
  color: string;
  fillColor?: string;
  width: React.ReactText;
  strokeWidthStops?: StrokeWidthStop[];
  value: BezierEditorValue;
  position: Position;
  waveAmplitude?: number;
  showFill?: boolean;
  bottomY?: number;
  inverted?: boolean; // If true, fill is above/left of the line instead of below/right
  direction?: "horizontal" | "vertical"; // Wave direction
  middlePoints?: MiddlePoint[]; // Points the curve must pass through
  blurType?: "none" | "gaussian" | "radial"; // Type of blur effect
  blurAmount?: number; // Blur amount
  filterId?: string; // Unique filter ID for this wave
  opacity?: number; // Opacity for the wave (0-1)
}

export const Curve: React.FC<CurveProps> = memo(function Curve({
  color,
  fillColor,
  width,
  strokeWidthStops,
  value,
  position,
  waveAmplitude = 1.25,
  showFill = true,
  bottomY = 1000,
  inverted = false,
  direction = "horizontal",
  blurType = "none",
  blurAmount: _blurAmount = 5,
  filterId,
  opacity = 1,
}) {
  const { x, y } = usePosition(position);

  const curveData = useMemo(() => {
    const [x0, x1] = position.x;
    const [y0, y1] = position.y;
    const xRange = x1 - x0;
    const yRange = y1 - y0;
    
    if (direction === "vertical") {
      // VERTICAL WAVE: Goes from top to bottom, curves left/right
      const startX = x(0);
      const endX = x(1);

      // START POINT: Fixed at the top
      const sx = startX;
      const sy = y(0);

      // END POINT: Fixed at the bottom
      const ex = endX;
      const ey = y(1);
      
      // CURVATURE AMPLITUDE: Controls how much the control points can deviate horizontally
      const waveAmplitudePixels = 1000 * waveAmplitude;
      
      // Use the average X for calculating control point offsets
      const baseX = (startX + endX) / 2;
      
      // CONTROL POINT 1: Controls curvature at the START of the line
      const cy1 = y0 + value[0] * yRange;
      const cx1 = baseX + (value[1] - 0.5) * waveAmplitudePixels;
      
      // CONTROL POINT 2: Controls curvature at the END of the line
      const cy2 = y0 + value[2] * yRange;
      const cx2 = baseX + (value[3] - 0.5) * waveAmplitudePixels;

      // SVG Cubic Bezier path for the curve line: M(start), C(control1, control2, end)
      const curvePath = `M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`;

      // FILLED AREA PATH: 
      // If inverted: fill is to the left of the curve (to left: 0)
      // If not inverted: fill is to the right of the curve (to right: 1000)
      const fillTargetX = inverted ? 0 : 1000;
      const fillPath = `${curvePath} L${fillTargetX},${ey} L${fillTargetX},${sy} Z`;

      return { curvePath, fillPath };
    } else {
      // HORIZONTAL WAVE: Goes from left to right, curves up/down
      const startY = y(0);
      const endY = y(1);

      // START POINT: Fixed at the left edge
      const sx = x(0);
      const sy = startY;

      // END POINT: Fixed at the right edge
      const ex = x(1);
      const ey = endY;
      
      // CURVATURE AMPLITUDE: Controls how much the control points can deviate vertically
      const waveAmplitudePixels = 1000 * waveAmplitude;
      
      // Use the average Y for calculating control point offsets
      const baseY = (startY + endY) / 2;
      
      // CONTROL POINT 1: Controls curvature at the START of the line
      const cx1 = x0 + value[0] * xRange;
      const cy1 = baseY + (value[1] - 0.5) * waveAmplitudePixels;
      
      // CONTROL POINT 2: Controls curvature at the END of the line
      const cx2 = x0 + value[2] * xRange;
      const cy2 = baseY + (value[3] - 0.5) * waveAmplitudePixels;

      // SVG Cubic Bezier path for the curve line: M(start), C(control1, control2, end)
      const curvePath = `M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`;

      // FILLED AREA PATH: 
      // If inverted: fill is above the curve (to top: 0)
      // If not inverted: fill is below the curve (to bottom: bottomY)
      const fillTargetY = inverted ? 0 : bottomY;
      const fillPath = `${curvePath} L${ex},${fillTargetY} L${sx},${fillTargetY} Z`;

      return { curvePath, fillPath };
    }
  }, [value, position, x, y, waveAmplitude, bottomY, inverted, direction]);

  const strokeSegments = useMemo(() => {
    if (!strokeWidthStops || strokeWidthStops.length === 0) {
      return null;
    }

    const sortedStops = [...strokeWidthStops].sort((a, b) => a.offset - b.offset);
    const segments: Array<{ path: string; strokeWidth: number }> = [];
    const numSegments = 100;

    const [x0, x1] = position.x;
    const [y0, y1] = position.y;
    const xRange = x1 - x0;
    const yRange = y1 - y0;
    const waveAmplitudePixels = 1000 * waveAmplitude;

    const getPointOnBezier = (t: number) => {
      if (direction === "vertical") {
        const startX = x(0);
        const endX = x(1);
        const baseX = (startX + endX) / 2;
        
        const cy1 = y0 + value[0] * yRange;
        const cx1 = baseX + (value[1] - 0.5) * waveAmplitudePixels;
        const cy2 = y0 + value[2] * yRange;
        const cx2 = baseX + (value[3] - 0.5) * waveAmplitudePixels;

        const sx = startX;
        const sy = y(0);
        const ex = endX;
        const ey = y(1);
        
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        return {
          x: mt3 * sx + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * ex,
          y: mt3 * sy + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * ey,
        };
      } else {
        const startY = y(0);
        const endY = y(1);
        const baseY = (startY + endY) / 2;

        const cx1 = x0 + value[0] * xRange;
        const cy1 = baseY + (value[1] - 0.5) * waveAmplitudePixels;
        const cx2 = x0 + value[2] * xRange;
        const cy2 = baseY + (value[3] - 0.5) * waveAmplitudePixels;

        const sx = x(0);
        const sy = startY;
        const ex = x(1);
        const ey = endY;
        
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        return {
          x: mt3 * sx + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * ex,
          y: mt3 * sy + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * ey,
        };
      }
    };

    const getWidthAtOffset = (offset: number): number => {
      if (offset <= sortedStops[0].offset) {
        return sortedStops[0].width;
      }
      if (offset >= sortedStops[sortedStops.length - 1].offset) {
        return sortedStops[sortedStops.length - 1].width;
      }
      for (let j = 0; j < sortedStops.length - 1; j++) {
        if (offset >= sortedStops[j].offset && offset <= sortedStops[j + 1].offset) {
          const ratio = (offset - sortedStops[j].offset) / (sortedStops[j + 1].offset - sortedStops[j].offset);
          return sortedStops[j].width + (sortedStops[j + 1].width - sortedStops[j].width) * ratio;
        }
      }
      return sortedStops[0].width;
    };

    for (let i = 0; i < numSegments; i++) {
      const t1 = i / numSegments;
      const t2 = (i + 1) / numSegments;
      const offset1 = t1 * 100;
      const offset2 = t2 * 100;

      const width1 = getWidthAtOffset(offset1);
      const width2 = getWidthAtOffset(offset2);
      const avgWidth = (width1 + width2) / 2;

      const p1 = getPointOnBezier(t1);
      const p2 = getPointOnBezier((t1 + t2) / 2);
      const p3 = getPointOnBezier(t2);

      const segmentPath = `M${p1.x},${p1.y} Q${p2.x},${p2.y} ${p3.x},${p3.y}`;
      segments.push({ path: segmentPath, strokeWidth: avgWidth });
    }

    return segments;
  }, [strokeWidthStops, position, value, x, y, waveAmplitude, direction]);

  const filterUrl = blurType !== "none" && filterId ? `url(#${filterId})` : undefined;

  return (
    <>
      {/* FILLED AREA: Colored area underneath the curve */}
      {showFill && fillColor && (
        <path
          fill={fillColor}
          d={curveData.fillPath}
          filter={filterUrl}
          opacity={opacity}
        />
      )}
      {/* SOLID LINE: The curve line on top */}
      {strokeSegments ? (
        strokeSegments.map((segment, index) => (
          <path
            key={index}
            fill="none"
            stroke={color}
            strokeWidth={segment.strokeWidth}
            d={segment.path}
            filter={filterUrl}
            opacity={opacity}
          />
        ))
      ) : (
        <path
          fill="none"
          stroke={color}
          strokeWidth={width}
          d={curveData.curvePath}
          filter={filterUrl}
          opacity={opacity}
        />
      )}
    </>
  );
});

