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

  function showConsentChoices() {
    if (typeof window.zaraz?.showConsentModal === "function") {
      window.zaraz.showConsentModal();
      return true;
    }

    if (window.zaraz?.consent) {
      window.zaraz.consent.modal = true;
      return true;
    }

    return false;
  }

  function addConsentChoicesControl() {
    if (document.querySelector("#oes-privacy-choices")) {
      return;
    }

    const button = document.createElement("button");
    button.id = "oes-privacy-choices";
    button.type = "button";
    button.textContent = "Privacy choices";
    button.style.cssText = [
      "display:block",
      "margin:1rem auto",
      "padding:0",
      "border:0",
      "background:transparent",
      "color:inherit",
      "font:inherit",
      "font-size:0.75rem",
      "text-decoration:underline",
      "cursor:pointer",
    ].join(";");
    button.addEventListener("click", () => {
      if (!showConsentChoices()) {
        console.warn("OES privacy choices are not available yet. Please try again.");
      }
    });

    const footer = document.querySelector("footer");
    (footer || document.body).append(button);
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

  addConsentChoicesControl();
  window.OESAnalytics = Object.freeze({ showConsentChoices, track });
})();
