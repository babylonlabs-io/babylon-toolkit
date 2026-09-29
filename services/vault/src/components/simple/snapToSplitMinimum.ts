const SPLIT_SNAP_BAND_FRACTION = 0.005;
const SPLIT_SNAP_MIN_DRAG_SATS = 1;

export function snapToSplitMinimum(
  sats: number,
  {
    splitMinSats,
    sliderMinSats,
    sliderMaxSats,
    currentSats,
  }: {
    splitMinSats: number;
    sliderMinSats: number;
    sliderMaxSats: number;
    currentSats: number;
  },
): number {
  return splitMinSats > sliderMinSats &&
    splitMinSats < sliderMaxSats &&
    sats > sliderMinSats &&
    sats < sliderMaxSats &&
    Math.abs(sats - splitMinSats) <=
      (sliderMaxSats - sliderMinSats) * SPLIT_SNAP_BAND_FRACTION &&
    Math.abs(sats - currentSats) > SPLIT_SNAP_MIN_DRAG_SATS
    ? splitMinSats
    : sats;
}
