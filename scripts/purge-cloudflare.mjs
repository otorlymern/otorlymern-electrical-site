const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;

if (!apiToken || !zoneId) {
  console.log(
    "Cloudflare purge skipped: configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID repository secrets.",
  );
  process.exit(0);
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purge_everything: true }),
  },
);

let result;
try {
  result = await response.json();
} catch {
  throw new Error(`Cloudflare purge returned HTTP ${response.status} without JSON`);
}

if (!response.ok || result.success !== true) {
  const details = Array.isArray(result.errors)
    ? result.errors.map((error) => error.message || error.code).filter(Boolean).join("; ")
    : "unknown error";
  throw new Error(`Cloudflare purge failed (HTTP ${response.status}): ${details}`);
}

console.log("Requested a full Cloudflare cache purge for the deployed OES artifact.");
