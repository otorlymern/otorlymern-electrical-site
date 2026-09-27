import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_CONFIG = [
  { id: "audio-sources", label: "Audio Sources" },
  { id: "audio-modifiers", label: "Audio Modifiers" },
  { id: "cv-sources", label: "CV Sources" },
  { id: "cv-modifiers", label: "CV Modifiers" },
];

const ICON_ROOT = path.join(__dirname, "PT_Symbols_SVG");
const OUTPUT_PATH = path.join(__dirname, "icons-manifest.json");

async function readIconsForCategory(id) {
  const dir = path.join(ICON_ROOT, id);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function buildManifest() {
  const categories = [];
  let totalIcons = 0;

  for (const category of CATEGORY_CONFIG) {
    const icons = await readIconsForCategory(category.id);
    totalIcons += icons.length;

    categories.push({
      id: category.id,
      label: category.label,
      icons: icons.map((file) => ({
        file,
        path: path.posix.join("PT_Symbols_SVG", category.id, file),
      })),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    categories,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Manifest written to ${OUTPUT_PATH} with ${totalIcons} icons.`);
}

buildManifest().catch((error) => {
  console.error("Failed to generate icon manifest:", error);
  process.exit(1);
});
