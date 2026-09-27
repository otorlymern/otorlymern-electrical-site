import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXCLUDED_FILE_NAMES,
  EXCLUDED_PATH_PREFIXES,
  EXCLUDED_PATH_SEGMENTS,
  LOCAL_MEDIA_EXTENSIONS,
  SOURCE_ONLY_EXTENSIONS,
  TEMPORARY_PUBLIC_BINARY_ALLOWLIST,
} from "./deploy-config.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const deployRoot = path.join(repositoryRoot, "_deploy");
const siteOrigin = "https://otorlymern-electrical.com";
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "site-manifest.json"), "utf8"),
);
const failures = [];
let fileCount = 0;
let byteCount = 0;
const deployedHtmlSources = new Set();

function sourcePathForRoute(route) {
  if (route === "/") {
    return "index.html";
  }
  if (route.endsWith("/")) {
    return `${route.slice(1)}index.html`;
  }
  return `${route.slice(1)}.html`;
}

const manifestPageBySource = new Map(
  manifest.pages.map((page) => [sourcePathForRoute(page.path), page]),
);

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

async function walk(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = normalize(path.join(relativeDirectory, entry.name));
    const segments = relativePath.split("/");
    const extension = path.extname(entry.name).toLowerCase();

    if (segments.some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))) {
      failures.push(`excluded path segment published: ${relativePath}`);
    }
    if (
      EXCLUDED_PATH_PREFIXES.some(
        (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`),
      )
    ) {
      failures.push(`source-only path published: ${relativePath}`);
    }
    if (EXCLUDED_FILE_NAMES.has(entry.name) || SOURCE_ONLY_EXTENSIONS.has(extension)) {
      failures.push(`source-only file published: ${relativePath}`);
    }
    if (
      LOCAL_MEDIA_EXTENSIONS.has(extension) &&
      !TEMPORARY_PUBLIC_BINARY_ALLOWLIST.has(relativePath)
    ) {
      failures.push(`unapproved local media published: ${relativePath}`);
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, relativePath);
      continue;
    }
    if (!entry.isFile()) {
      failures.push(`unsupported filesystem entry published: ${relativePath}`);
      continue;
    }

    const fileStats = await stat(fullPath);
    fileCount += 1;
    byteCount += fileStats.size;

    if (extension === ".html") {
      deployedHtmlSources.add(relativePath);
      const html = await readFile(fullPath, "utf8");
      if (!/<html(?:\s|>)/i.test(html) || !/<\/html>/i.test(html)) {
        failures.push(`incomplete HTML document: ${relativePath}`);
      }

      const page = manifestPageBySource.get(relativePath);
      if (!page) {
        failures.push(`HTML page missing from manifest: ${relativePath}`);
      } else {
        const canonicalUrl = new URL(page.path, siteOrigin).href;
        const canonicalMatch = html.match(
          /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i,
        );
        const descriptionMatch = html.match(
          /<meta\b(?=[^>]*\bname=["']description["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/i,
        );
        const robotsMatch = html.match(
          /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/i,
        );
        const ogTitleCount = (
          html.match(/<meta\b(?=[^>]*\bproperty=["']og:title["'])[^>]*>/gi) ?? []
        ).length;

        if (canonicalMatch?.[1] !== canonicalUrl) {
          failures.push(`incorrect canonical in ${relativePath}: ${canonicalMatch?.[1] ?? "missing"}`);
        }
        if (!descriptionMatch?.[1]) {
          failures.push(`missing description in ${relativePath}`);
        }
        if (robotsMatch?.[1] !== (page.indexable ? "index,follow" : "noindex,follow")) {
          failures.push(`incorrect robots metadata in ${relativePath}`);
        }
        if (ogTitleCount !== 1) {
          failures.push(`expected one og:title in ${relativePath}; found ${ogTitleCount}`);
        }
      }

      for (const match of html.matchAll(
        /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      )) {
        try {
          JSON.parse(match[1]);
        } catch (error) {
          failures.push(`invalid JSON-LD in ${relativePath}: ${error.message}`);
        }
      }
    }
  }
}

await walk(deployRoot);

for (const [sourcePath] of manifestPageBySource) {
  if (!deployedHtmlSources.has(sourcePath)) {
    failures.push(`manifest page missing from deploy: ${sourcePath}`);
  }
}

const sitemap = await readFile(path.join(deployRoot, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
const expectedSitemapUrls = manifest.pages
  .filter((page) => page.indexable)
  .map((page) => new URL(page.path, siteOrigin).href);
if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedSitemapUrls)) {
  failures.push("sitemap URLs do not match the ordered indexable manifest routes");
}

const robots = await readFile(path.join(deployRoot, "robots.txt"), "utf8");
if (!robots.includes("Disallow: /cdn-cgi/") || !robots.includes(`${siteOrigin}/sitemap.xml`)) {
  failures.push("robots.txt is missing the Cloudflare exclusion or sitemap reference");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Audited ${fileCount} deploy files (${(byteCount / 1024 / 1024).toFixed(1)} MiB); no source-only paths escaped.`,
  );
}
