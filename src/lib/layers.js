import { traceMask, loopToPath } from "./geometry.js";
import { colorDistance, rgbToHex, hexToRgb } from "./color.js";
import { groupEdgeKey, dilateMask, ditherGroupSilhouette } from "./edges.js";

export const MAX_IDENTITY_COLOR_DISTANCE = 12000;

export function layerId(layer) { return layer.id || layer.hex; }

// Matches next-run layers back to their previous identity (by color + pixel-share
// similarity) so drag positions / group membership survive a recompute.
// Mutates `nextLayers` in place; returns the advanced id counter.
export function restoreLayerIdentities(nextLayers, previousLayers, previousPositions, nextLayerIdStart) {
  const nextTotal = nextLayers.reduce((sum, layer) => sum + layer.hardPixels, 0) || 1;
  const previousTotal = previousLayers.reduce((sum, layer) => sum + layer.hardPixels, 0) || 1;
  const candidates = [];
  for (let nextIndex = 0; nextIndex < nextLayers.length; nextIndex++) {
    for (let previousIndex = 0; previousIndex < previousLayers.length; previousIndex++) {
      const nextLayer = nextLayers[nextIndex];
      const previousLayer = previousLayers[previousIndex];
      const colorScore = colorDistance(nextLayer.rgb, previousLayer.rgb);
      if (colorScore > MAX_IDENTITY_COLOR_DISTANCE) continue;
      const shareDifference = Math.abs(nextLayer.hardPixels / nextTotal - previousLayer.hardPixels / previousTotal);
      candidates.push({
        nextIndex,
        previousIndex,
        score: colorScore + shareDifference * 4096
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.previousIndex - b.previousIndex || a.nextIndex - b.nextIndex);
  const usedNext = new Set();
  const usedPrevious = new Set();
  const matchForNext = new Map();
  for (const candidate of candidates) {
    if (usedNext.has(candidate.nextIndex) || usedPrevious.has(candidate.previousIndex)) continue;
    usedNext.add(candidate.nextIndex);
    usedPrevious.add(candidate.previousIndex);
    matchForNext.set(candidate.nextIndex, previousLayers[candidate.previousIndex]);
  }
  let nextLayerId = nextLayerIdStart;
  nextLayers.forEach((layer, index) => {
    const previous = matchForNext.get(index);
    const id = previous ? layerId(previous) : `layer-${nextLayerId++}`;
    const position = previousPositions.get(id);
    layer.id = id;
    layer.groupId = previous?.groupId || null;
    layer.dragX = position?.dragX || 0;
    layer.dragY = position?.dragY || 0;
    layer.z = position?.z ?? index;
  });
  return nextLayerId;
}

// Collapses `layers` into the units the UI/export operate on: solo layers, or
// merged groups (contiguous runs of layers sharing a valid groupId).
export function getLayerUnits(layers, layerGroups) {
  const units = [];
  const seenGroups = new Set();
  for (const layer of layers) {
    const groupId = layer.groupId;
    if (groupId && layerGroups.has(groupId)) {
      if (seenGroups.has(groupId)) continue;
      const members = layers.filter(candidate => candidate.groupId === groupId);
      if (members.length > 1) {
        units.push({ key: `group:${groupId}`, type: "group", group: layerGroups.get(groupId), layers: members });
        seenGroups.add(groupId);
        continue;
      }
    }
    units.push({ key: `layer:${layerId(layer)}`, type: "layer", layer, layers: [layer] });
  }
  return units;
}

export function groupPreviewRgb(unit) {
  if (unit.group.representativeHex) return hexToRgb(unit.group.representativeHex);
  const total = unit.layers.reduce((sum, layer) => sum + Math.max(1, layer.pixels || 0), 0) || 1;
  return [0, 1, 2].map(channel => Math.round(unit.layers.reduce(
    (sum, layer) => sum + layer.rgb[channel] * Math.max(1, layer.pixels || 0),
    0
  ) / total));
}

export function getGroupEdgeTarget(unit) {
  const rgb = groupPreviewRgb(unit);
  return {
    edgeKey: groupEdgeKey(unit.group.id),
    edgeLabel: "Merged layer edge",
    edgeSubject: `${unit.layers.length} merged colors`,
    name: "Merged layer",
    hex: unit.group.representativeHex || rgbToHex(rgb),
    rgb
  };
}

export function validLayerGroup(layer, layerGroups) {
  return layer.groupId ? layerGroups.get(layer.groupId) || null : null;
}

export function layerRenderHex(layer, layerGroups) {
  return validLayerGroup(layer, layerGroups)?.representativeHex || layer.hex;
}

export function effectiveMask(layer, layerGroups) {
  return validLayerGroup(layer, layerGroups) && layer.groupMask ? layer.groupMask : layer.mask;
}

export function effectiveLoops(layer, layerGroups) {
  return validLayerGroup(layer, layerGroups) && layer.groupLoops ? layer.groupLoops : layer.loops;
}

export function effectivePath(layer, layerGroups) {
  return validLayerGroup(layer, layerGroups) && layer.groupPath !== undefined ? layer.groupPath : layer.path;
}

// Union of every member's RAW mask (not the dithered/halftoned per-member
// silhouette) — the correct single-shape export when a group has a solid
// representative color, since dithering only matters when colors differ.
export function mergedUnitPath(unit, width, height, smooth) {
  const unionMask = new Uint8Array(width * height);
  for (const layer of unit.layers) {
    for (let i = 0; i < unionMask.length; i++) if (layer.mask[i]) unionMask[i] = 1;
  }
  const loops = traceMask(unionMask, width, height);
  return loops.map(loop => loopToPath(loop, smooth)).join("");
}

export function clearLayerGroupGeometry(layer) {
  delete layer.groupMask;
  delete layer.groupLoops;
  delete layer.groupPath;
}

export function setLayerGroupGeometry(layer, mask, width, height, smooth) {
  const loops = traceMask(mask, width, height);
  layer.groupMask = mask;
  layer.groupLoops = loops;
  layer.groupPath = loops.map(loop => loopToPath(loop, smooth)).join("");
}

// Recomputes each grouped layer's on-canvas silhouette (halftone dilation or
// dither-blended union), mutating layer.group{Mask,Loops,Path} in place.
// `getEdgeForUnit(unit)` supplies the get-or-create edge lookup the caller's
// store owns (deriveGroupedGeometry itself never touches an edges Map).
export function deriveGroupedGeometry(layers, layerGroups, width, height, smooth, getEdgeForUnit) {
  for (const layer of layers) clearLayerGroupGeometry(layer);
  for (const unit of getLayerUnits(layers, layerGroups)) {
    if (unit.type !== "group") continue;
    const edge = getEdgeForUnit(unit);
    if (edge.mode === "halftone") {
      if (!edge.halftoneExpansion) continue;
      for (const layer of unit.layers) {
        setLayerGroupGeometry(layer, dilateMask(layer.mask, width, height, edge.halftoneExpansion), width, height, smooth);
      }
      continue;
    }
    const unionMask = new Uint8Array(width * height);
    for (const layer of unit.layers) {
      for (let i = 0; i < unionMask.length; i++) if (layer.mask[i]) unionMask[i] = 1;
    }
    const keepMask = ditherGroupSilhouette(unionMask, edge, width, height);
    for (const layer of unit.layers) {
      const memberMask = new Uint8Array(layer.mask.length);
      for (let i = 0; i < memberMask.length; i++) memberMask[i] = layer.mask[i] && keepMask[i] ? 1 : 0;
      setLayerGroupGeometry(layer, memberMask, width, height, smooth);
    }
  }
}

export function effectiveVisiblePixelCount(layers, layerGroups, width, height) {
  const visible = new Uint8Array(width * height);
  for (const layer of layers) {
    const mask = effectiveMask(layer, layerGroups);
    for (let i = 0; i < visible.length; i++) if (mask?.[i]) visible[i] = 1;
  }
  return visible.reduce((sum, value) => sum + value, 0);
}

export function computeEffectiveGeometryStats(layers, layerGroups, width, height) {
  const nodeCount = layers.reduce(
    (sum, layer) => sum + effectiveLoops(layer, layerGroups).reduce((count, loop) => count + loop.length, 0),
    0
  );
  const visibleCount = effectiveVisiblePixelCount(layers, layerGroups, width, height);
  return { nodeCount, visibleCount };
}

// Prunes stale selection/group/edge state after `layers` changes shape (e.g.
// a recompute), and keeps each group's members contiguous in stacking order.
// Mutates `layers` (returned, possibly a new array), `layerGroups`,
// `selectedLayerIds`, `edges`, and `expandedEdges` in place.
export function reconcileLayerOrganization({ layers, layerGroups, selectedLayerIds, edges, expandedEdges }) {
  const existingIds = new Set(layers.map(layerId));
  for (const selectedId of Array.from(selectedLayerIds)) {
    if (!existingIds.has(selectedId)) selectedLayerIds.delete(selectedId);
  }
  for (const layer of layers) {
    if (layer.groupId && !layerGroups.has(layer.groupId)) layer.groupId = null;
  }
  for (const groupId of Array.from(layerGroups.keys())) {
    const members = layers.filter(layer => layer.groupId === groupId);
    if (members.length < 2) {
      for (const member of members) {
        member.groupId = null;
        clearLayerGroupGeometry(member);
      }
      edges.delete(groupEdgeKey(groupId));
      expandedEdges.delete(groupEdgeKey(groupId));
      layerGroups.delete(groupId);
      continue;
    }
    const memberIds = new Set(members.map(layerId));
    const firstIndex = layers.findIndex(layer => memberIds.has(layerId(layer)));
    const contiguous = layers.slice(firstIndex, firstIndex + members.length).every(layer => memberIds.has(layerId(layer)));
    if (!contiguous) {
      const insertionIndex = layers.slice(0, firstIndex).filter(layer => !memberIds.has(layerId(layer))).length;
      const remaining = layers.filter(layer => !memberIds.has(layerId(layer)));
      remaining.splice(insertionIndex, 0, ...members);
      layers = remaining;
    }
    for (const member of members) selectedLayerIds.delete(layerId(member));
  }
  const activeGroupEdgeKeys = new Set(Array.from(layerGroups.keys(), groupEdgeKey));
  for (const key of Array.from(edges.keys())) {
    if (key.startsWith("group:") && !activeGroupEdgeKeys.has(key)) edges.delete(key);
  }
  for (const key of Array.from(expandedEdges)) {
    if (key.startsWith("group:") && !activeGroupEdgeKeys.has(key)) expandedEdges.delete(key);
  }
  return layers;
}

export function buildPosterCanvas(layers, layerGroups, width, height) {
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  for (const layer of layers) {
    const path = effectivePath(layer, layerGroups);
    if (!path) continue;
    context.fillStyle = layerRenderHex(layer, layerGroups);
    try { context.fill(new Path2D(path), "evenodd"); }
    catch (_) { context.fill(new Path2D(path)); }
  }
  return canvas;
}
