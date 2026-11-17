import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = path.join(root, "solutions/DIY/projects");
const pages = (await readdir(folder)).filter(name => name.endsWith(".html") && name !== "index.html").sort();
const index = await readFile(path.join(folder, "index.html"), "utf8");
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
for (const name of pages) {
  const html = await readFile(path.join(folder, name), "utf8");
  check(/<html\b[^>]*lang="en"/.test(html), `${name}: missing language`);
  check((html.match(/<h1\b/g) || []).length === 1, `${name}: expected one h1`);
  check(html.includes('projects/project-guide.css'), `${name}: missing shared guide CSS`);
  for (const section of ["description", "materials", "steps"]) {
    check(html.includes(`guide-window--${section}`), `${name}: missing ${section} window`);
  }
  check(index.includes(`href="${name}"`), `${name}: not discoverable from project index`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  check(new Set(ids).size === ids.length, `${name}: duplicate IDs`);
  for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) {
    check(ids.includes(decodeURIComponent(match[1])), `${name}: missing fragment ${match[1]}`);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    check(/\balt="[^"]*"/.test(match[0]), `${name}: image missing alt text`);
    const src = match[0].match(/\bsrc="([^"]+)"/)?.[1];
    if (!src || /^(https?:|data:)/.test(src)) continue;
    const file = src.startsWith("/") ? path.join(root, decodeURIComponent(src)) : path.resolve(folder, decodeURIComponent(src));
    try { await access(file); } catch { errors.push(`${name}: image not found: ${src}`); }
  }
  const text = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).length;
  console.log(`${name}: ${words} words; ${[...html.matchAll(/<img\b/g)].length} images`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS: all ${pages.length} DIY guides have a consistent shell, discoverable index entry, valid fragments, and available local images.`);
}
