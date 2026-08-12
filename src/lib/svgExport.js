import { slugify } from "./color.js";
import { effectivePath, layerRenderHex, mergedUnitPath, getLayerUnits } from "./layers.js";

export function escapeXML(value) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
}

// `doc` = { width, height, name, smooth, layerGroups }
export function makeLayerSVG(layer, doc) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">\n` +
    `  <title>${escapeXML(layer.name)} — ${layer.hex}</title>\n` +
    `  <desc>Posterized color layer extracted from ${escapeXML(doc.name)} by REDLINE.</desc>\n` +
    `  <path id="${slugify(layer.name)}" d="${effectivePath(layer, doc.layerGroups)}" fill="${layerRenderHex(layer, doc.layerGroups)}" fill-rule="evenodd"/>\n` +
    `</svg>\n`;
}

export function makeMergedLayerSVG(unit, doc) {
  const representative = unit.group.representativeHex || "transparent";
  const mergedColorNames = unit.layers.map(layer => layer.name).join(", ");
  const paths = unit.group.representativeHex
    ? `    <path id="${slugify(unit.group.id)}-shape" data-merged-colors="${escapeXML(mergedColorNames)}" d="${mergedUnitPath(unit, doc.width, doc.height, doc.smooth)}" fill="${unit.group.representativeHex}" fill-rule="evenodd"/>`
    : unit.layers.map(layer =>
        `    <path id="${slugify(layer.name)}" data-color-name="${escapeXML(layer.name)}" data-original-color="${layer.hex}" d="${effectivePath(layer, doc.layerGroups)}" fill="${layerRenderHex(layer, doc.layerGroups)}" fill-rule="evenodd"/>`
      ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">\n` +
    `  <title>Merged layer — ${unit.layers.length} colors</title>\n` +
    `  <desc>${unit.layers.length} member paths extracted from ${escapeXML(doc.name)}. Representative color: ${representative}.</desc>\n` +
    `  <g id="${slugify(unit.group.id)}" data-layer-type="merged" data-representative-color="${representative}">\n${paths}\n  </g>\n` +
    `</svg>\n`;
}

export function makeOutputUnitSVG(unit, doc) {
  return unit.type === "group" ? makeMergedLayerSVG(unit, doc) : makeLayerSVG(unit.layer, doc);
}

export function makeCombinedSVG(layers, layerGroups, doc) {
  const paths = getLayerUnits(layers, layerGroups).map(unit => {
    if (unit.type === "layer") {
      const layer = unit.layer;
      return `  <path id="${slugify(layer.name)}" data-color-name="${escapeXML(layer.name)}" d="${effectivePath(layer, doc.layerGroups)}" fill="${layerRenderHex(layer, doc.layerGroups)}" fill-rule="evenodd"/>`;
    }
    const representative = unit.group.representativeHex || "transparent";
    const mergedColorNames = unit.layers.map(layer => layer.name).join(", ");
    const members = unit.group.representativeHex
      ? `    <path id="${slugify(unit.group.id)}-shape" data-merged-colors="${escapeXML(mergedColorNames)}" d="${mergedUnitPath(unit, doc.width, doc.height, doc.smooth)}" fill="${unit.group.representativeHex}" fill-rule="evenodd"/>`
      : unit.layers.map(layer =>
          `    <path id="${slugify(layer.name)}" data-color-name="${escapeXML(layer.name)}" data-original-color="${layer.hex}" d="${effectivePath(layer, doc.layerGroups)}" fill="${layerRenderHex(layer, doc.layerGroups)}" fill-rule="evenodd"/>`
        ).join("\n");
    return `  <g id="${slugify(unit.group.id)}" data-layer-type="merged" data-representative-color="${representative}">\n${members}\n  </g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">\n` +
    `  <title>${escapeXML(doc.name.replace(/\.(?:png|jpe?g)$/i, ""))} — posterized layers</title>\n${paths}\n</svg>\n`;
}
