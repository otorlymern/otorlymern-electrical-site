import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const deployRoot = path.resolve(scriptDirectory, "..", "_deploy");
const repositoryRoot = path.resolve(scriptDirectory, "..");
const siteOrigin = "https://otorlymern-electrical.com";
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "site-manifest.json"), "utf8"),
);
const redirectAliases = new Set(
  manifest.pages.flatMap((page) => page.redirects ?? []),
);
const ignoredPathPrefixes = ["/cdn-cgi/"];
const linkAttributes = new Set([
  "action",
  "data",
  "data-pingpong-pdf",
  "data-src",
  "href",
  "poster",
  "src",
]);

async function listHtmlFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listHtmlFiles(fullPath, relativePath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      files.push(relativePath.split(path.sep).join("/"));
    }
  }

  return files;
}

function documentUrl(relativeHtmlPath) {
  if (relativeHtmlPath === "index.html") {
    return `${siteOrigin}/`;
  }
  if (relativeHtmlPath.endsWith("/index.html")) {
    return `${siteOrigin}/${relativeHtmlPath.slice(0, -"index.html".length)}`;
  }
  return `${siteOrigin}/${relativeHtmlPath.slice(0, -".html".length)}`;
}

function extractInternalTargets(html, baseUrl) {
  const targets = [];
  const attributePattern = /\b([a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi;

  for (const match of html.matchAll(attributePattern)) {
    const attribute = match[1].toLowerCase();
    const rawValue = match[3].trim();
    if (
      !linkAttributes.has(attribute) ||
      !rawValue ||
      rawValue.startsWith("#") ||
      rawValue.includes("${")
    ) {
      continue;
    }
    if (/^(?:data|javascript|mailto|tel):/i.test(rawValue) || rawValue.startsWith("//")) {
      continue;
    }

    let target;
    try {
      target = new URL(rawValue, baseUrl);
    } catch {
      targets.push({ rawValue, pathName: null });
      continue;
    }

    if (target.origin !== siteOrigin || ignoredPathPrefixes.some((prefix) => target.pathname.startsWith(prefix))) {
      continue;
    }

    targets.push({ rawValue, pathName: target.pathname });
  }

  return targets;
}

async function pathExists(publicPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(publicPath);
  } catch {
    return false;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidates = [];

  if (!relativePath) {
    candidates.push("index.html");
  } else if (relativePath.endsWith("/")) {
    candidates.push(path.join(relativePath, "index.html"));
  } else if (path.extname(relativePath)) {
    candidates.push(relativePath);
  } else {
    candidates.push(`${relativePath}.html`, path.join(relativePath, "index.html"));
  }

  for (const candidate of candidates) {
    try {
      await access(path.join(deployRoot, candidate));
      return true;
    } catch {
      // Continue checking Neocities clean-URL candidates.
    }
  }

  return false;
}

const htmlFiles = await listHtmlFiles(deployRoot);
const brokenLinks = [];
const noncanonicalLinks = [];
let checkedLinks = 0;

for (const relativeHtmlPath of htmlFiles) {
  const html = await readFile(path.join(deployRoot, relativeHtmlPath), "utf8");
  const seenOnPage = new Set();

  for (const target of extractInternalTargets(html, documentUrl(relativeHtmlPath))) {
    const key = `${target.rawValue}|${target.pathName}`;
    if (seenOnPage.has(key)) {
      continue;
    }
    seenOnPage.add(key);
    checkedLinks += 1;

    if (!target.pathName || !(await pathExists(target.pathName))) {
      brokenLinks.push(`${relativeHtmlPath} -> ${target.rawValue}`);
    }
    if (
      target.pathName &&
      (target.pathName.endsWith(".html") || redirectAliases.has(target.pathName))
    ) {
      noncanonicalLinks.push(`${relativeHtmlPath} -> ${target.rawValue}`);
    }
  }
}

if (brokenLinks.length > 0 || noncanonicalLinks.length > 0) {
  if (brokenLinks.length > 0) {
  console.error(`Found ${brokenLinks.length} missing internal targets across ${checkedLinks} checked links:`);
  console.error(brokenLinks.join("\n"));
  }
  if (noncanonicalLinks.length > 0) {
    console.error(`Found ${noncanonicalLinks.length} noncanonical internal links:`);
    console.error(noncanonicalLinks.join("\n"));
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${checkedLinks} internal links across ${htmlFiles.length} HTML files; none are missing.`);
}
