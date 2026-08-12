import { slugify } from "./color.js";
import { getLayerUnits } from "./layers.js";
import { makeOutputUnitSVG, makeCombinedSVG } from "./svgExport.js";
import { zipFiles } from "./zip.js";

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

// `doc` = { name, width, height, smooth, layerGroups }
export function buildZipBlob(layers, doc) {
  const folder = doc.name
    .replace(/\.(?:png|jpe?g)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim() || "vector";
  const units = getLayerUnits(layers, doc.layerGroups);
  const files = units.map((unit, index) => {
    if (unit.type === "layer") {
      const layer = unit.layer;
      return {
        name: `${folder}/${String(index + 1).padStart(2, "0")}-${slugify(layer.name)}-${layer.hex.slice(1).toLowerCase()}.svg`,
        data: makeOutputUnitSVG(unit, doc)
      };
    }
    const firstName = slugify(unit.layers[0].name);
    const suffix = unit.group.representativeHex ? unit.group.representativeHex.slice(1).toLowerCase() : "mixed";
    return {
      name: `${folder}/${String(index + 1).padStart(2, "0")}-merged-${firstName}-plus-${unit.layers.length - 1}-${suffix}.svg`,
      data: makeOutputUnitSVG(unit, doc)
    };
  });
  files.push({ name: `${folder}/00-combined-posterized.svg`, data: makeCombinedSVG(layers, doc.layerGroups, doc) });
  files.push({
    name: `${folder}/palette.txt`,
    data: units.flatMap((unit, outputIndex) => unit.layers.map((layer, memberIndex) => {
      const outputNumber = String(outputIndex + 1).padStart(2, "0");
      const layerNumber = unit.type === "group" ? `${outputNumber}.${memberIndex + 1}` : outputNumber;
      const representative = unit.type === "group"
        ? `\tmerged representative ${unit.group.representativeHex || "transparent"}`
        : "";
      return `${layerNumber}\t${layer.name}\t${layer.hex}\t${layer.pixels} pixels${representative}`;
    })).join("\n") + "\n"
  });
  const groupedUnits = units.filter(unit => unit.type === "group");
  if (groupedUnits.length) {
    files.push({
      name: `${folder}/groups.json`,
      data: JSON.stringify({
        version: 1,
        source: doc.name,
        groups: groupedUnits.map(unit => ({
          outputIndex: units.indexOf(unit) + 1,
          representativeColor: unit.group.representativeHex,
          members: unit.layers.map(layer => ({ name: layer.name, color: layer.hex }))
        }))
      }, null, 2) + "\n"
    });
  }
  return { blob: zipFiles(files), folder, unitCount: units.length };
}

export function downloadZIP(layers, doc) {
  const { blob, folder, unitCount } = buildZipBlob(layers, doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${folder}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return unitCount;
}

export async function copyCombinedSVG(layers, doc) {
  const svg = makeCombinedSVG(layers, doc.layerGroups, doc);
  await copyText(svg);
  return svg;
}
