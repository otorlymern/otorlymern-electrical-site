import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://otorlymern-electrical.com";
const directBucketOrigin = "https://s3.us-west-2.wasabisys.com/media.otorlymern-electrical.com";
const knownPublicObject = `${directBucketOrigin}/pdfs/manuals/arp-2600-owners-manual.pdf`;
const peerTubeEmbed = "https://videos.scanlines.xyz/videos/embed/93372fc7-a688-465e-a9e3-cd3d47ab4eff";
const expectedDmarc = "v=DMARC1; p=none; rua=mailto:postmaster@otorlymern-electrical.com; adkim=r; aspf=r; pct=100";
const expectedSpf = "v=spf1 include:spf.privateemail.com ~all";
const expectedMx = new Set(["mx1.privateemail.com", "mx2.privateemail.com"]);
const healthUserAgent = "OES-Backend-Health/1.0";
const publicResolver = new dns.Resolver();
publicResolver.setServers(["1.1.1.1", "8.8.8.8"]);
const args = new Set(process.argv.slice(2));
const runRepository = args.has("--repo") || !args.has("--live");
const runLive = args.has("--live");
const runPutDiagnostic = runLive && !args.has("--skip-put");
const failures = [];
const blocked = [];
let checks = 0;

function pass(message) {
  checks += 1;
  console.log(`PASS ${message}`);
}

function fail(message) {
  checks += 1;
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function block(message) {
  checks += 1;
  blocked.push(message);
  console.warn(`BLOCKED ${message}`);
}

class MonitoringBlockedError extends Error {}

async function check(name, operation) {
  try {
    const detail = await operation();
    pass(detail ? `${name}: ${detail}` : name);
  } catch (error) {
    const message = `${name}: ${error.message}`;
    if (error instanceof MonitoringBlockedError) block(message);
    else fail(message);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...options,
      headers: { "User-Agent": healthUserAgent, ...options.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isKnownGithubBotFightChallenge(response, { url, userAgentCategory }) {
  if (process.env.GITHUB_ACTIONS !== "true") return false;
  if (url !== `${origin}/` && url !== origin) return false;
  if (!["normal-monitor", "googlebot"].includes(userAgentCategory)) return false;
  if (response.status !== 403) return false;
  if (response.headers.get("server")?.toLowerCase() !== "cloudflare") return false;
  return /^[a-f0-9]+-[A-Z]{3}$/i.test(response.headers.get("cf-ray") || "");
}

function requireStatus(response, expected, { url, userAgentCategory = "normal-monitor" }) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.status)) {
    const edgeHeaders = ["server", "cf-ray", "cf-cache-status"]
      .map((name) => [name, response.headers.get(name)])
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}=${value}`)
      .join(" ");
    const message = `url=${url} expected=${allowed.join("/")} actual=${response.status} ` +
      `user-agent=${userAgentCategory}${edgeHeaders ? ` ${edgeHeaders}` : ""}`;
    if (isKnownGithubBotFightChallenge(response, { url, userAgentCategory })) {
      throw new MonitoringBlockedError(`${message} reason=confirmed-bot-fight-mode-edge-challenge`);
    }
    throw new Error(message);
  }
}

function runResultStateTests() {
  const priorGithubActions = process.env.GITHUB_ACTIONS;
  const response = (status, headers = {}) => new Response(null, { status, headers });
  try {
    process.env.GITHUB_ACTIONS = "true";
    assert.doesNotThrow(() => requireStatus(response(200), 200, { url: `${origin}/` }));
    assert.throws(() => requireStatus(response(403), 200, { url: `${origin}/` }), (error) => !(error instanceof MonitoringBlockedError));
    assert.throws(
      () => requireStatus(response(403, { server: "cloudflare", "cf-ray": "abc123-IAD" }), 200, {
        url: `${origin}/`, userAgentCategory: "normal-monitor",
      }),
      MonitoringBlockedError,
    );
    assert.throws(
      () => requireStatus(response(403, { server: "cloudflare", "cf-ray": "abc123-IAD" }), 200, {
        url: `${origin}/`, userAgentCategory: "googlebot",
      }),
      MonitoringBlockedError,
    );
    for (const status of [404, 500]) {
      assert.throws(() => requireStatus(response(status), 200, { url: `${origin}/` }), (error) => !(error instanceof MonitoringBlockedError));
    }
    assert.ok(!(new DOMException("timed out", "AbortError") instanceof MonitoringBlockedError));
    assert.ok(!(new TypeError("network failure") instanceof MonitoringBlockedError));
    console.log("PASS result-state tests: 200 passes; narrow GitHub Cloudflare challenge blocks; 403/404/500/network errors fail");
  } finally {
    if (priorGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = priorGithubActions;
  }
}

async function loadManifest() {
  const source = await readFile(path.join(repositoryRoot, "site-manifest.json"), "utf8");
  const manifest = JSON.parse(source);
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new Error("site-manifest.json has no pages");
  }
  return manifest;
}

async function repositoryAudit() {
  await check("manifest is small and internally consistent", async () => {
    const manifest = await loadManifest();
    const paths = new Set();
    for (const page of manifest.pages) {
      const allowed = new Set(["path", "title", "description", "indexable", "schema", "redirects", "monitor"]);
      const extras = Object.keys(page).filter((key) => !allowed.has(key));
      if (extras.length > 0) throw new Error(`${page.path} has unsupported fields: ${extras.join(", ")}`);
      if (!page.path?.startsWith("/")) throw new Error(`invalid path ${page.path}`);
      if (paths.has(page.path)) throw new Error(`duplicate path ${page.path}`);
      if (!page.title || !page.description || typeof page.indexable !== "boolean") {
        throw new Error(`${page.path} is missing required metadata`);
      }
      paths.add(page.path);
    }
    return `${manifest.pages.length} routes`;
  });

  await check("generated crawler files exist", async () => {
    const [robots, sitemap] = await Promise.all([
      readFile(path.join(repositoryRoot, "_deploy", "robots.txt"), "utf8"),
      readFile(path.join(repositoryRoot, "_deploy", "sitemap.xml"), "utf8"),
    ]);
    if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`) || !robots.includes("Disallow: /cdn-cgi/")) {
      throw new Error("robots.txt does not contain the required sitemap and /cdn-cgi/ policy");
    }
    const manifest = await loadManifest();
    for (const page of manifest.pages.filter((entry) => entry.indexable)) {
      if (!sitemap.includes(`<loc>${origin}${page.path}</loc>`)) {
        throw new Error(`sitemap is missing ${page.path}`);
      }
    }
    return "robots and sitemap match policy";
  });
}

async function livePageAudit() {
  const manifest = await loadManifest();
  const routes = manifest.pages.filter((page) => page.monitor);
  for (const page of routes) {
    await check(`live route ${page.path}`, async () => {
      const url = `${origin}${page.path}`;
      const response = await fetchWithTimeout(url);
      requireStatus(response, 200, { url });
      return "200";
    });
  }

  for (const userAgent of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
  ]) {
    await check(`crawler homepage ${userAgent.includes("Inspection") ? "inspection" : "Googlebot"}`, async () => {
      const response = await fetchWithTimeout(origin, { headers: { "User-Agent": userAgent } });
      requireStatus(response, 200, {
        url: origin,
        userAgentCategory: userAgent.includes("Inspection") ? "google-inspection" : "googlebot",
      });
      return "200";
    });
  }

  await check("live robots policy", async () => {
    const url = `${origin}/robots.txt`;
    const response = await fetchWithTimeout(url);
    requireStatus(response, 200, { url });
    const body = await response.text();
    if (!body.includes(`Sitemap: ${origin}/sitemap.xml`) || !body.includes("Disallow: /cdn-cgi/")) {
      throw new Error("required directives are absent");
    }
    return "valid";
  });

  await check("live sitemap", async () => {
    const url = `${origin}/sitemap.xml`;
    const response = await fetchWithTimeout(url);
    requireStatus(response, 200, { url });
    const body = await response.text();
    if (!body.includes("<urlset") || !body.includes(`<loc>${origin}/</loc>`)) {
      throw new Error("not a recognizable OES sitemap");
    }
    return "valid";
  });
}

async function storageAndVideoAudit() {
  await check("Wasabi known public object GET", async () => {
    const response = await fetchWithTimeout(knownPublicObject, {
      headers: { Range: "bytes=0-0" },
    });
    requireStatus(response, [200, 206], { url: knownPublicObject, userAgentCategory: "normal-monitor-wasabi" });
    return `${response.status}`;
  });

  await check("Wasabi anonymous LIST denied", async () => {
    const url = `${directBucketOrigin}?list-type=2`;
    const response = await fetchWithTimeout(url, { redirect: "manual" });
    requireStatus(response, 403, { url, userAgentCategory: "normal-monitor-wasabi" });
    return "403";
  });

  if (runPutDiagnostic) {
    await check("Wasabi anonymous PUT denied", async () => {
      const sentinel = `${directBucketOrigin}/oes-health-sentinels/${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      const response = await fetchWithTimeout(sentinel, {
        method: "PUT",
        headers: {
          "Content-Type": "text/plain",
          "If-None-Match": "*",
        },
        body: "",
        redirect: "manual",
      });
      if (response.status >= 200 && response.status < 300) {
        throw new Error(`PUBLIC WRITE EXPOSURE: ${response.status}; sentinel preserved at ${sentinel}`);
      }
      requireStatus(response, 403, { url: sentinel, userAgentCategory: "normal-monitor-wasabi" });
      return "403";
    });
  } else {
    console.log("SKIP Wasabi anonymous PUT diagnostic (--skip-put)");
  }

  await check("PeerTube embed", async () => {
    const response = await fetchWithTimeout(peerTubeEmbed);
    requireStatus(response, 200, { url: peerTubeEmbed, userAgentCategory: "normal-monitor-peertube" });
    return "200";
  });
}

async function dnsAndExpiryAudit() {
  await check("MX", async () => {
    const records = await publicResolver.resolveMx("otorlymern-electrical.com");
    const exchanges = new Set(records.map((record) => record.exchange.replace(/\.$/, "")));
    for (const expected of expectedMx) if (!exchanges.has(expected)) throw new Error(`missing ${expected}`);
    return [...exchanges].sort().join(", ");
  });

  await check("SPF", async () => {
    const values = (await publicResolver.resolveTxt("otorlymern-electrical.com")).map((parts) => parts.join(""));
    if (!values.includes(expectedSpf)) throw new Error("expected Private Email SPF record is absent");
    return "present";
  });

  await check("DKIM", async () => {
    const values = (await publicResolver.resolveTxt("default._domainkey.otorlymern-electrical.com")).map((parts) => parts.join(""));
    if (!values.some((value) => value.startsWith("v=DKIM1;"))) throw new Error("default selector is absent");
    return "default selector present";
  });

  await check("DMARC", async () => {
    const values = (await publicResolver.resolveTxt("_dmarc.otorlymern-electrical.com")).map((parts) => parts.join(""));
    if (!values.includes(expectedDmarc)) throw new Error("monitoring policy differs from the operations record");
    return "p=none";
  });

  await check("DNSSEC validation", async () => {
    const { stdout } = await execFileAsync("dig", ["@1.1.1.1", "+dnssec", "otorlymern-electrical.com", "A"]);
    if (!/flags:.*\bad\b/.test(stdout) || !/RRSIG/.test(stdout)) throw new Error("validated AD response was not returned");
    return "AD and RRSIG present";
  });

  await check("TLS certificate expiry", async () => {
    const certificate = await new Promise((resolve, reject) => {
      const socket = tls.connect(443, "otorlymern-electrical.com", { servername: "otorlymern-electrical.com" }, () => {
        const peer = socket.getPeerCertificate();
        socket.end();
        resolve(peer);
      });
      socket.setTimeout(15_000, () => socket.destroy(new Error("TLS timeout")));
      socket.once("error", reject);
    });
    const expires = new Date(certificate.valid_to);
    const days = Math.floor((expires - Date.now()) / 86_400_000);
    if (!Number.isFinite(days) || days < 21) throw new Error(`only ${days} days remain`);
    return `${days} days`;
  });

  await check("domain expiry", async () => {
    const response = await fetchWithTimeout("https://rdap.verisign.com/com/v1/domain/otorlymern-electrical.com");
    requireStatus(response, 200, {
      url: "https://rdap.verisign.com/com/v1/domain/otorlymern-electrical.com",
      userAgentCategory: "normal-monitor-rdap",
    });
    const rdap = await response.json();
    const expiration = rdap.events?.find((event) => event.eventAction === "expiration")?.eventDate;
    if (!expiration) throw new Error("RDAP did not return an expiration event");
    const days = Math.floor((new Date(expiration) - Date.now()) / 86_400_000);
    if (days < 60) throw new Error(`only ${days} days remain`);
    return `${expiration.slice(0, 10)} (${days} days)`;
  });
}

if (args.has("--test-result-states")) {
  runResultStateTests();
  process.exit(0);
}

if (runRepository) await repositoryAudit();
if (runLive) {
  await livePageAudit();
  await storageAndVideoAudit();
  await dnsAndExpiryAudit();
}

console.log(`\nOES health audit: ${checks - failures.length - blocked.length} PASS / ${blocked.length} BLOCKED / ${failures.length} FAIL (${checks} total).`);
if (blocked.length > 0) {
  console.warn("\nMonitoring blocked by confirmed Cloudflare Bot Fight Mode pattern; page content was not verified:");
  for (const warning of blocked) console.warn(`- ${warning}`);
}
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
