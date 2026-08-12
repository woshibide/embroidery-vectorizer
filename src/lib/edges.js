import { clamp } from "./geometry.js";

export function groupEdgeKey(groupId) { return `group:${groupId}`; }

export function createDefaultEdge(key) {
  return {
    key,
    mode: "halftone",
    halftoneExpansion: 0,
    colorReach: 75,
    whiteReach: 75
  };
}

export function colorInvolvement(source, color) {
  const white = [255, 255, 255];
  const dr = color[0] - white[0];
  const dg = color[1] - white[1];
  const db = color[2] - white[2];
  const lengthSquared = dr * dr * .30 + dg * dg * .59 + db * db * .11;
  if (!lengthSquared) return 1;
  return clamp(
    ((source[0] - white[0]) * dr * .30 + (source[1] - white[1]) * dg * .59 + (source[2] - white[2]) * db * .11) / lengthSquared,
    0,
    1
  );
}

export function dilateMask(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const horizontal = new Uint8Array(mask.length);
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x++) count += mask[row + x];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = count > 0 ? 1 : 0;
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) count -= mask[row + removeX];
      if (addX < width) count += mask[row + addX];
    }
  }
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y++) count += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      expanded[y * width + x] = count > 0 ? 1 : 0;
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) count -= horizontal[removeY * width + x];
      if (addY < height) count += horizontal[addY * width + x];
    }
  }
  return expanded;
}

// The canonical silhouette is the preview's midpoint: dither can soften
// inward from that edge, while the untouched interior remains solid.
export function ditherGroupSilhouette(unionMask, edge, width, height) {
  const distance = new Uint16Array(unionMask.length);
  distance.fill(0xffff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!unionMask[i]) continue;
      if (
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        !unionMask[i - 1] || !unionMask[i + 1] || !unionMask[i - width] || !unionMask[i + width]
      ) distance[i] = 0;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!unionMask[i] || distance[i] === 0) continue;
      let nearest = distance[i];
      if (x > 0) nearest = Math.min(nearest, distance[i - 1] + 1);
      if (y > 0) nearest = Math.min(nearest, distance[i - width] + 1);
      distance[i] = nearest;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!unionMask[i] || distance[i] === 0) continue;
      let nearest = distance[i];
      if (x + 1 < width) nearest = Math.min(nearest, distance[i + 1] + 1);
      if (y + 1 < height) nearest = Math.min(nearest, distance[i + width] + 1);
      distance[i] = nearest;
    }
  }

  const keepMask = new Uint8Array(unionMask.length);
  const colorStart = 1 - edge.colorReach / 100;
  const whiteEnd = edge.whiteReach / 100;
  let currentError = new Float32Array(width);
  let nextError = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    nextError.fill(0);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!unionMask[i]) continue;
      const involvement = .5 + Math.min(1, distance[i] / 4) * .5;
      let keep;
      let error = 0;
      if (colorStart > whiteEnd) {
        keep = involvement >= colorStart;
      } else if (involvement < colorStart) {
        keep = false;
      } else if (involvement > whiteEnd) {
        keep = true;
      } else {
        const adjusted = clamp(involvement + currentError[x], 0, 1);
        keep = adjusted >= .5;
        error = adjusted - (keep ? 1 : 0);
      }
      keepMask[i] = keep ? 1 : 0;
      if (error) {
        if (x + 1 < width) currentError[x + 1] += error * 7 / 16;
        if (x > 0) nextError[x - 1] += error * 3 / 16;
        nextError[x] += error * 5 / 16;
        if (x + 1 < width) nextError[x + 1] += error * 1 / 16;
      }
    }
    [currentError, nextError] = [nextError, currentError];
  }
  return keepMask;
}
