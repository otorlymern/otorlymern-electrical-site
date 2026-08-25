(() => {
  "use strict";

  const EVENT_NAMES = new Set([
    "archive_search",
    "manual_open",
    "service_form_start",
    "service_form_submit",
    "outbound_click",
    "contact_click",
  ]);

  function cleanProperties(properties = {}) {
    return Object.fromEntries(
      Object.entries(properties)
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
        .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : value]),
    );
  }

  async function track(eventName, properties = {}) {
    if (!EVENT_NAMES.has(eventName) || typeof window.zaraz?.track !== "function") {
      return false;
    }

    try {
      await window.zaraz.track(eventName, {
        page_path: window.location.pathname,
        ...cleanProperties(properties),
      });
      return true;
    } catch (error) {
      console.warn(`OES analytics event was not delivered: ${eventName}`, error);
      return false;
    }
  }

  function outboundDestination(url) {
    const hostname = url.hostname.toLowerCase();
    if (hostname === "reverb.com" || hostname.endsWith(".reverb.com")) {
      return "reverb";
    }
    if (hostname.includes("peertube")) {
      return "peertube";
    }
    return null;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) {
      return;
    }

    const href = link.getAttribute("href") || "";
    if (/^(?:mailto|tel):/i.test(href)) {
      void track("contact_click", {
        contact_type: href.split(":", 1)[0].toLowerCase(),
      });
      return;
    }

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    const destination = outboundDestination(url);
    if (destination) {
      void track("outbound_click", { destination });
      return;
    }

    const isPdf = url.pathname.toLowerCase().endsWith(".pdf");
    if (isPdf || link.dataset.oesManualOpen === "true") {
      void track("manual_open", {
        archive_id: link.dataset.archiveId || "unknown",
        asset_type: isPdf ? "pdf" : "record",
      });
    }
  });

  window.OESAnalytics = Object.freeze({ track });
})();
