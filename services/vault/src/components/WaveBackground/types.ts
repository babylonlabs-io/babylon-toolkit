/**
 * BezierEditorValue represents a cubic Bezier curve with normalized coordinates (0-1).
 * Format: [control1X, control1Y, control2X, control2Y]
 * 
 * - control1X (value[0]): X position of first control point, normalized 0-1 (0 = left edge, 1 = right edge)
 * - control1Y (value[1]): Y position of first control point, normalized 0-1 (0 = top, 1 = bottom, 0.5 = center)
 * - control2X (value[2]): X position of second control point, normalized 0-1
 * - control2Y (value[3]): Y position of second control point, normalized 0-1
 * 
 * The start and end points are defined by the Position prop.
 * The control points determine the curvature:
 *   - control1Y values > 0.5 curve the line upward at the start
 *   - control1Y values < 0.5 curve the line downward at the start
 *   - control2Y values > 0.5 curve the line upward at the end
 *   - control2Y values < 0.5 curve the line downward at the end
 *   - Larger differences from 0.5 = more pronounced curves
 */
export type BezierEditorValue = [number, number, number, number];

export interface Position {
  x: [number, number];
  y: [number, number];
}

