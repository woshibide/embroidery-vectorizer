import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveConfig } from "vite";

test("Vercel publishes the directory produced by Vite", async () => {
  const root = new URL("../", import.meta.url);
  const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
  const vite = await resolveConfig({ root: fileURLToPath(root) }, "build");

  assert.equal(typeof vercel.outputDirectory, "string");
  assert.equal(
    resolve(vite.root, vercel.outputDirectory),
    resolve(vite.root, vite.build.outDir),
    "Vercel must publish Vite's actual build output directory",
  );
});
