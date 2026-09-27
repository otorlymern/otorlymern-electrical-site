import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXCLUDED_FILE_NAMES,
  EXCLUDED_PATH_PREFIXES,
  EXCLUDED_PATH_SEGMENTS,
  LOCAL_MEDIA_EXTENSIONS,
  PUBLIC_ROOT_DIRECTORIES,
  PUBLIC_ROOT_FILES,
  SOURCE_ONLY_EXTENSIONS,
  TEMPORARY_PUBLIC_BINARY_ALLOWLIST,
} from "./deploy-config.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const deployRoot = path.join(repositoryRoot, "_deploy");

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isExcluded(relativePath) {
  const normalizedPath = normalize(relativePath);
  const segments = normalizedPath.split("/");
  const fileName = segments.at(-1);
  const extension = path.extname(fileName).toLowerCase();

  if (segments.some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))) {
    return true;
  }

  if (
    EXCLUDED_PATH_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  if (EXCLUDED_FILE_NAMES.has(fileName) || SOURCE_ONLY_EXTENSIONS.has(extension)) {
    return true;
  }

  if (
    LOCAL_MEDIA_EXTENSIONS.has(extension) &&
    !TEMPORARY_PUBLIC_BINARY_ALLOWLIST.has(normalizedPath)
  ) {
    return true;
  }

  return false;
}

async function copyTree(sourceDirectory, destinationDirectory, relativeDirectory = "") {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  let fileCount = 0;
  let byteCount = 0;

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (isExcluded(relativePath)) {
      continue;
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to publish symbolic link: ${normalize(relativePath)}`);
    }

    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      const childTotals = await copyTree(sourcePath, destinationPath, relativePath);
      fileCount += childTotals.fileCount;
      byteCount += childTotals.byteCount;
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported public filesystem entry: ${normalize(relativePath)}`);
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    const { size } = await import("node:fs/promises").then(({ stat }) => stat(sourcePath));
    fileCount += 1;
    byteCount += size;
  }

  return { fileCount, byteCount };
}

if (path.basename(deployRoot) !== "_deploy" || path.dirname(deployRoot) !== repositoryRoot) {
  throw new Error(`Unsafe deployment output path: ${deployRoot}`);
}

await rm(deployRoot, { force: true, recursive: true });
await mkdir(deployRoot, { recursive: true });

let fileCount = 0;
let byteCount = 0;

for (const directoryName of PUBLIC_ROOT_DIRECTORIES) {
  const sourceDirectory = path.join(repositoryRoot, directoryName);
  const destinationDirectory = path.join(deployRoot, directoryName);
  await mkdir(destinationDirectory, { recursive: true });
  const totals = await copyTree(sourceDirectory, destinationDirectory, directoryName);
  fileCount += totals.fileCount;
  byteCount += totals.byteCount;
}

for (const fileName of PUBLIC_ROOT_FILES) {
  const sourcePath = path.join(repositoryRoot, fileName);
  try {
    await copyFile(sourcePath, path.join(deployRoot, fileName));
    const { size } = await import("node:fs/promises").then(({ stat }) => stat(sourcePath));
    fileCount += 1;
    byteCount += size;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

console.log(
  `Built _deploy with ${fileCount} files (${(byteCount / 1024 / 1024).toFixed(1)} MiB).`,
);
