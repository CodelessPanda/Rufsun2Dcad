export function getSolarFluxColor(value: number, min: number, max: number, alpha = 1): [number, number, number, number] {
  const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  const stops: Array<[number, number, number, number]> = [
    [12, 27, 145, 1],
    [0, 99, 255, 1],
    [0, 190, 255, 1],
    [0, 205, 82, 1],
    [255, 230, 0, 1],
    [255, 123, 0, 1],
    [230, 0, 0, 1]
  ];
  const contrast = Math.max(0, Math.min(1, (t - 0.08) / 0.84));
  const scaled = contrast * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - index;
  const a = stops[index];
  const b = stops[index + 1];
  return [
    mix(a[0], b[0], localT),
    mix(a[1], b[1], localT),
    mix(a[2], b[2], localT),
    Math.round(alpha * 255)
  ];
}

export function solarFluxLegendStops(min: number, max: number) {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = min + (max - min) * t;
    const [r, g, b] = getSolarFluxColor(value, min, max, 1);
    return { value, color: `rgb(${r}, ${g}, ${b})` };
  });
}

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
