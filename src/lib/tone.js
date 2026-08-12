import { clamp } from "./geometry.js";

export function cubicBezier(a, b, c, d, t) {
  const inverse = 1 - t;
  return inverse ** 3 * a + 3 * inverse ** 2 * t * b + 3 * inverse * t ** 2 * c + t ** 3 * d;
}

export function curveValueAt(normalizedX, tonePoints) {
  const x = clamp(normalizedX, 0, 1);
  const points = tonePoints;
  let index = points.length - 2;
  for (let i = 0; i < points.length - 1; i++) {
    if (x <= points[i + 1].x) { index = i; break; }
  }
  const start = points[index];
  const end = points[index + 1];
  const out = start.handleOut || start;
  const incoming = end.handleIn || end;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 14; iteration++) {
    const t = (low + high) / 2;
    const curveX = cubicBezier(start.x, out.x, incoming.x, end.x, t);
    if (curveX < x) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return clamp(cubicBezier(start.y, out.y, incoming.y, end.y, t), 0, 1);
}

export function buildToneLut(tonePoints) {
  const lut = new Uint8Array(256);
  for (let value = 0; value < 256; value++) {
    lut[value] = Math.round(curveValueAt(value / 255, tonePoints) * 255);
  }
  return lut;
}

export function mapToneValue(value, toneLut) {
  return toneLut[clamp(Math.round(value), 0, 255)];
}

export function applyToneCurve(rgb, toneLut) {
  return rgb.map(value => mapToneValue(value, toneLut));
}

export function pixelLuminance(pixels, offset) {
  return pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
}

export function luminanceIsAnalyzed(luminance, toneBlack, toneWhite) {
  return luminance >= toneBlack && luminance <= toneWhite;
}

export function computeHistogram(pixels, alpha) {
  const histogram = new Uint32Array(256);
  if (!pixels) return histogram;
  const pixelCount = pixels.length / 4;
  const step = Math.max(1, Math.ceil(pixelCount / 300000));
  for (let i = 0; i < pixelCount; i += step) {
    const p = i * 4;
    if (pixels[p + 3] < alpha) continue;
    const luma = Math.round(pixelLuminance(pixels, p));
    histogram[luma]++;
  }
  return histogram;
}

export function toneGraphPoint(point, width, height) {
  const inset = 8;
  return {
    x: inset + point.x * (width - inset * 2),
    y: height - inset - point.y * (height - inset * 2)
  };
}

export function normalizedTonePoint(x, y, width, height) {
  const inset = 8;
  return {
    x: clamp((x - inset) / Math.max(1, width - inset * 2), 0, 1),
    y: clamp((height - inset - y) / Math.max(1, height - inset * 2), 0, 1)
  };
}
