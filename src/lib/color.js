import { pixelLuminance, luminanceIsAnalyzed, applyToneCurve } from "./tone.js";

export function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr * .30 + dg * dg * .59 + db * db * .11;
}

// Weighted median-cut builds a compact palette from actual source colors.
export function extractPalette(pixels, alphaCutoff, targetCount, toneLut, toneBlack, toneWhite) {
  const pixelCount = pixels.length / 4;
  const step = Math.max(1, Math.ceil(pixelCount / 50000));
  const histogram = new Map();
  for (let i = 0; i < pixelCount; i += step) {
    const p = i * 4;
    if (pixels[p + 3] < alphaCutoff) continue;
    if (!luminanceIsAnalyzed(pixelLuminance(pixels, p), toneBlack, toneWhite)) continue;
    const mapped = applyToneCurve([pixels[p], pixels[p + 1], pixels[p + 2]], toneLut);
    const key = (mapped[0] << 16) | (mapped[1] << 8) | mapped[2];
    histogram.set(key, (histogram.get(key) || 0) + 1);
  }
  const colors = Array.from(histogram, ([key, count]) => ({
    rgb: [(key >> 16) & 255, (key >> 8) & 255, key & 255],
    count
  }));
  if (!colors.length) return [];
  if (colors.length <= targetCount) return colors.sort((a, b) => b.count - a.count).map(item => item.rgb);

  const boxes = [colors];
  while (boxes.length < targetCount) {
    let splitIndex = -1;
    let splitChannel = 0;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.length < 2) continue;
      const mins = [255, 255, 255];
      const maxs = [0, 0, 0];
      let weight = 0;
      for (const item of box) {
        weight += item.count;
        for (let c = 0; c < 3; c++) {
          mins[c] = Math.min(mins[c], item.rgb[c]);
          maxs[c] = Math.max(maxs[c], item.rgb[c]);
        }
      }
      const ranges = maxs.map((max, c) => max - mins[c]);
      const channel = ranges.indexOf(Math.max(...ranges));
      const score = ranges[channel] * Math.sqrt(weight);
      if (score > bestScore) {
        bestScore = score;
        splitIndex = i;
        splitChannel = channel;
      }
    }
    if (splitIndex < 0) break;
    const box = boxes.splice(splitIndex, 1)[0].sort((a, b) => a.rgb[splitChannel] - b.rgb[splitChannel]);
    const total = box.reduce((sum, item) => sum + item.count, 0);
    let cumulative = 0;
    let cut = 1;
    for (; cut < box.length; cut++) {
      cumulative += box[cut - 1].count;
      if (cumulative >= total / 2) break;
    }
    cut = Math.min(cut, box.length - 1);
    boxes.push(box.slice(0, cut), box.slice(cut));
  }

  return boxes.map(box => {
    const total = box.reduce((sum, item) => sum + item.count, 0);
    return [0, 1, 2].map(channel => Math.round(box.reduce((sum, item) => sum + item.rgb[channel] * item.count, 0) / total));
  });
}

export function rgbToHex(rgb) {
  return `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  return [(hue + 360) % 360, saturation, lightness];
}

export function describeColor(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  if (s < .10) {
    if (l < .08) return "Black";
    if (l < .25) return "Charcoal";
    if (l < .48) return "Dark Gray";
    if (l < .72) return "Gray";
    if (l < .91) return "Silver";
    return "White";
  }
  const hues = [
    [15, "Red"], [38, "Orange"], [52, "Amber"], [68, "Yellow"], [92, "Lime"],
    [145, "Green"], [175, "Teal"], [195, "Cyan"], [215, "Azure"], [245, "Blue"],
    [270, "Indigo"], [292, "Violet"], [325, "Magenta"], [348, "Rose"], [360, "Red"]
  ];
  const base = hues.find(([limit]) => h < limit)?.[1] || "Red";
  let modifier = "";
  if (l < .22) modifier = "Deep ";
  else if (l < .38) modifier = "Dark ";
  else if (l > .86) modifier = "Pale ";
  else if (l > .70) modifier = "Light ";
  else if (s < .42) modifier = "Muted ";
  else if (s > .82) modifier = "Vivid ";
  return `${modifier}${base}`;
}

export function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "color";
}

export function hexToRgb(hex) {
  const value = String(hex || "").replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return [0, 0, 0];
  return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16));
}
