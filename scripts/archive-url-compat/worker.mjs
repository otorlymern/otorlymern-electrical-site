import { REDIRECTS } from "./redirects.mjs";
import { REDIRECT_OVERRIDES } from "./redirect-overrides.mjs";
import { TREE_ALIGNMENT_REDIRECTS } from "./tree-alignment-redirects-v2-2026-11-05.mjs";
import { LINK_REPAIR_REDIRECTS, LINK_REPAIR_CANONICAL_PATHS } from "./link-repair-redirects-2026-11-11.mjs";

const MEDIA_HOST = "media.otorlymern-electrical.com";
const ROUTES = { ...REDIRECTS, ...REDIRECT_OVERRIDES, ...TREE_ALIGNMENT_REDIRECTS, ...LINK_REPAIR_REDIRECTS };

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.hostname !== MEDIA_HOST) {
			return new Response("Not found", { status: 404 });
		}

		if (request.method !== "GET" && request.method !== "HEAD") {
			return fetch(request);
		}

		const requestPath = url.pathname.replace(/%[\da-f]{2}/gi, (escape) => escape.toUpperCase());
		if (LINK_REPAIR_CANONICAL_PATHS.has(requestPath)) {
			return fetch(request);
		}
		const targetPath = ROUTES[requestPath];
		if (!targetPath) {
			return fetch(request);
		}

		const target = new URL(targetPath, url.origin);
		target.search = url.search;
		return Response.redirect(target.toString(), 308);
	},
};
