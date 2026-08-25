import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const deployRoot = path.join(repositoryRoot, "_deploy");
const siteOrigin = "https://otorlymern-electrical.com";
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "site-manifest.json"), "utf8"),
);

function sourcePathForRoute(route) {
  if (route === "/") {
    return "index.html";
  }
  if (route.endsWith("/")) {
    return `${route.slice(1)}index.html`;
  }
  return `${route.slice(1)}.html`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function removeHeadElement(html, pattern) {
  return html.replace(pattern, "");
}

function insertBeforeHeadClose(html, markup) {
  if (!/<\/head>/i.test(html)) {
    throw new Error("HTML page has no closing head element");
  }
  return html.replace(/<\/head>/i, `${markup}\n</head>`);
}

function metadataMarkup(page) {
  const canonicalUrl = new URL(page.path, siteOrigin).href;
  const ogType = ["Article"].includes(page.schema)
    ? "article"
    : page.schema === "ProfilePage"
      ? "profile"
      : "website";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": page.schema,
    name: page.title,
    description: page.description,
    url: canonicalUrl,
  };

  return [
    `  <meta name="description" content="${escapeHtml(page.description)}">`,
    `  <meta name="robots" content="${page.indexable ? "index,follow" : "noindex,follow"}">`,
    `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `  <meta property="og:type" content="${ogType}">`,
    `  <meta property="og:title" content="${escapeHtml(page.title)}">`,
    `  <meta property="og:description" content="${escapeHtml(page.description)}">`,
    `  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    '  <meta name="twitter:card" content="summary">',
    `  <meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `  <meta name="twitter:description" content="${escapeHtml(page.description)}">`,
    `  <script type="application/ld+json" id="oes-page-jsonld">${JSON.stringify(structuredData)}</script>`,
  ].join("\n");
}

function replaceMetadata(html, page) {
  let output = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  output = removeHeadElement(
    output,
    /\s*<meta\b(?=[^>]*\bname=["'](?:description|robots|twitter:card|twitter:title|twitter:description)["'])[^>]*>/gi,
  );
  output = removeHeadElement(
    output,
    /\s*<meta\b(?=[^>]*\bproperty=["']og:(?:type|title|description|url)["'])[^>]*>/gi,
  );
  output = removeHeadElement(
    output,
    /\s*<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi,
  );
  output = removeHeadElement(
    output,
    /\s*<script\b(?=[^>]*\bid=["']oes-page-jsonld["'])[^>]*>[\s\S]*?<\/script>/gi,
  );
  return insertBeforeHeadClose(output, metadataMarkup(page));
}

function buildAliasMap() {
  const aliases = new Map();
  for (const page of manifest.pages) {
    for (const alias of page.redirects ?? []) {
      if (aliases.has(alias)) {
        throw new Error(`Duplicate redirect alias in manifest: ${alias}`);
      }
      aliases.set(alias, page.path);
    }
  }
  return aliases;
}

function normalizeInternalHref(rawHref, documentUrl, aliases) {
  if (!rawHref || rawHref.startsWith("#") || /^(?:data|javascript|mailto|tel):/i.test(rawHref)) {
    return rawHref;
  }

  let target;
  try {
    target = new URL(rawHref, documentUrl);
  } catch {
    return rawHref;
  }

  if (target.origin !== siteOrigin) {
    return rawHref;
  }

  let canonicalPath = aliases.get(target.pathname) ?? target.pathname;
  if (canonicalPath.endsWith("/index.html")) {
    canonicalPath = canonicalPath.slice(0, -"index.html".length);
  } else if (canonicalPath.endsWith(".html")) {
    canonicalPath = canonicalPath.slice(0, -".html".length);
  }

  return `${canonicalPath}${target.search}${target.hash}`;
}

function rewriteInternalHrefs(html, documentUrl, aliases) {
  return html.replace(/(<a\b[^>]*\bhref=)(['"])(.*?)\2/gi, (fullMatch, prefix, quote, rawHref) => {
    const canonicalHref = normalizeInternalHref(rawHref, documentUrl, aliases);
    return `${prefix}${quote}${canonicalHref}${quote}`;
  });
}

const aliases = buildAliasMap();
const expectedSources = new Set();

for (const page of manifest.pages) {
  const sourcePath = sourcePathForRoute(page.path);
  expectedSources.add(sourcePath);
  const absolutePath = path.join(deployRoot, sourcePath);
  const documentUrl = new URL(page.path, siteOrigin).href;
  let html = await readFile(absolutePath, "utf8");
  html = replaceMetadata(html, page);
  html = rewriteInternalHrefs(html, documentUrl, aliases);
  await writeFile(absolutePath, html);
}

async function listHtmlFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listHtmlFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(relativePath.split(path.sep).join("/"));
    }
  }
  return files;
}

const unexpectedHtml = (await listHtmlFiles(deployRoot)).filter(
  (sourcePath) => !expectedSources.has(sourcePath),
);
if (unexpectedHtml.length > 0) {
  throw new Error(`HTML files missing from site manifest:\n${unexpectedHtml.join("\n")}`);
}

const sitemapUrls = manifest.pages
  .filter((page) => page.indexable)
  .map((page) => `  <url><loc>${escapeXml(new URL(page.path, siteOrigin).href)}</loc></url>`)
  .join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`;
await writeFile(path.join(deployRoot, "sitemap.xml"), sitemap);

const robots = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /cdn-cgi/",
  "",
  `Sitemap: ${siteOrigin}/sitemap.xml`,
  "",
].join("\n");
await writeFile(path.join(deployRoot, "robots.txt"), robots);

console.log(
  `Generated metadata for ${manifest.pages.length} pages, ${aliases.size} redirect aliases, sitemap.xml, and robots.txt.`,
);
