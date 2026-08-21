(() => {
  const ARCHIVE_JSON_PATH = "/manuals/data/archive.json";
  const STORAGE_KEY = "oes.manuals.lastOpenedId";
  const PDFJS_LIB_URL = "/manuals/vendor/pdfjs/pdf.min.js";
  const PDFJS_WORKER_URL = "/manuals/vendor/pdfjs/pdf.worker.min.js";

  const MANUAL_PRESENTATION = Object.freeze({
    "488portastudio-tascam": {
      title: "Tascam 488 Portastudio Owner's Manual",
      era: "Introduced 1991",
    },
    "a3340s-sm-teac": {
      title: "TEAC A-3340S Service Manual",
      era: "Introduced 1973",
    },
    "arp-2600": {
      title: "ARP 2600 User Manual",
      era: "Introduced 1971",
    },
    "buchla-200-manual": {
      title: "Buchla 200 Series Manual",
      era: "Introduced 1970",
    },
    "buchla-music-easel-manual": {
      title: "Buchla Music Easel Manual",
      era: "Introduced 1973",
    },
    "eml-polybox-manual": {
      title: "EML Poly-Box Manual",
      era: "Introduced 1977",
    },
    "fisher-pr6-manual": {
      title: "Fisher PR-6 Manual",
    },
    "hfe-tascam-m-208-216-en": {
      title: "Tascam M-208 / M-216 Manual",
    },
    "hfe-teac-a-1500u-flyer-en": {
      title: "TEAC A-1500U Flyer",
    },
    "hfe-teac-a-3340s": {
      title: "TEAC A-3340S Manual",
      era: "Introduced 1973",
    },
    "hfe-teac-stereo-tape-recorders-1966-en": {
      title: "TEAC Stereo Tape Recorders",
      era: "Published 1966",
    },
    "hfe-yamaha-mt4x-en": {
      title: "Yamaha MT4X Owner's Manual",
    },
    mungoeuro: {
      title: "Mungo Euro Manual",
    },
    "oberheim-matrix-1000-owners-manual": {
      title: "Oberheim Matrix-1000 Owner's Manual",
      era: "Introduced 1988",
    },
    "ppg-w23-dm": {
      title: "PPG Wave 2.3 Manual",
      era: "Introduced 1984",
    },
    "revox-a77": {
      title: "Revox A77 User Manual",
      era: "Introduced 1967",
    },
    "roland-alpha-juno-1": {
      title: "Roland Alpha Juno-1 Manual",
      era: "Introduced 1985",
    },
    "roland-alpha-juno-1-2": {
      title: "Roland Alpha Juno-1 Manual",
      era: "Introduced 1985",
    },
    "roland-juno-2-usermanual": {
      title: "Roland Alpha Juno-2 User Manual",
      era: "Introduced 1985",
    },
    "roland-juno106-owners-manual": {
      title: "Roland Juno-106 Owner's Manual",
      era: "Introduced 1984",
    },
    "roland-juno106-owners-manual-2": {
      title: "Roland Juno-106 Owner's Manual",
      era: "Introduced 1984",
    },
    "roland-juno106-service-notes": {
      title: "Roland Juno-106 Service Notes",
      era: "Introduced 1984",
    },
    "roland-jx3p": {
      title: "Roland JX-3P Owner's Manual",
      era: "Introduced 1983",
    },
    "roland-tr-606-owners-manual": {
      title: "Roland TR-606 Owner's Manual",
      era: "Introduced 1981",
    },
    "roland-tr-909-owners-manual": {
      title: "Roland TR-909 Owner's Manual",
      era: "Introduced 1983",
    },
    sergemanual: {
      title: "Serge Modular Synthesizer Manual",
      era: "Introduced 1973",
    },
    "buchla-cookbook": {
      title: "Suzanne Ciani's Buchla Cookbook",
      era: "Published 1976",
    },
    "tascam-144-brochure": {
      title: "Tascam 144 Brochure",
      era: "Introduced 1979",
    },
    "tascam-144-owners-manual": {
      title: "Tascam 144 Owner's Manual",
      era: "Introduced 1979",
    },
    "tascam-234-brochure": {
      title: "Tascam 234 Brochure",
      era: "Introduced 1983",
    },
    "tascam-234-owners-manual": {
      title: "Tascam 234 Owner's Manual",
      era: "Introduced 1983",
    },
    "tascam-porta-02-manual": {
      title: "Tascam Porta 02 Manual",
    },
    tascam32: {
      title: "Tascam 32 Manual",
    },
    tascammfp01manual: {
      title: "Tascam MF-P01 Manual",
    },
    "teac-multitrack-primer": {
      title: "TEAC Multitrack Recording Primer",
    },
    "teac-white-paper": {
      title: "TEAC Recording White Paper",
    },
    "hordijk-twinpeak": {
      title: "Hordijk Twin Peak Resonator Manual",
    },
    vcs3: {
      title: "EMS VCS 3 Manual",
      era: "Introduced 1969",
    },
  });

  const state = {
    config: {
      recentLimit: 8,
      hideSoldOlderThanDays: null,
      defaultManualId: null,
    },
    manuals: [],
    soldUnits: [],
    manualById: new Map(),
    filteredManuals: [],
    selectedManualId: null,
    selectedManualCode: null,
    currentPdfUrl: null,
    pdfDoc: null,
    pageNum: 1,
    zoomFactor: 1,
    pdfJsReadyPromise: null,
    archiveData: null,
  };

  const els = {};

  function getEl(id) {
    return document.getElementById(id);
  }

  function normalize(str) {
    return (str || "").toString().trim().toUpperCase().replace(/\s+/g, "");
  }

  function tokenize(str) {
    return (str || "")
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter(Boolean);
  }

  function formatDate(value) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value || "");
    const date = new Date(dateOnly ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function escapeHtml(str) {
    return (str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getManualPresentation(manual) {
    return {
      title:
        manual.displayTitle ||
        MANUAL_PRESENTATION[manual.id]?.title ||
        manual.title,
      era: manual.releaseLabel || MANUAL_PRESENTATION[manual.id]?.era || "",
    };
  }

  function getDataUrlWithVersion(dataVersion) {
    const v = (dataVersion || "").trim();
    return v
      ? `${ARCHIVE_JSON_PATH}?v=${encodeURIComponent(v)}`
      : ARCHIVE_JSON_PATH;
  }

  function resolveAssetUrl(rawUrl, assetBaseUrl) {
    if (!rawUrl) return "";
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;

    const base = (assetBaseUrl || "").trim().replace(/\/$/, "");
    if (!base) return rawUrl;

    return rawUrl.startsWith("/") ? `${base}${rawUrl}` : `${base}/${rawUrl}`;
  }

  function readManualIdFromLocation() {
    const url = new URL(window.location.href);
    const queryId = url.searchParams.get("m");
    if (queryId) {
      return queryId;
    }

    const path = window.location.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      parts[0] === "manuals" &&
      parts[1] !== "index.html"
    ) {
      return parts[1];
    }

    return null;
  }

  function writeManualIdToLocation(manualId) {
    const url = new URL(window.location.href);
    url.searchParams.set("m", manualId);
    window.history.replaceState(
      {},
      "",
      `${url.pathname}?${url.searchParams.toString()}`,
    );
  }

  function updateStatus(text) {
    els.searchStatus.textContent = text || "";
  }

  function setSelectedManualInStorage(manualId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, manualId);
    } catch (_) {
      // No-op when storage is blocked.
    }
  }

  function getStoredManualId() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function findExactManualCodeMatch(normalizedCode) {
    if (!normalizedCode) {
      return null;
    }

    const soldUnit = state.soldUnits.find(
      (unit) => unit._manualCodeNormalized === normalizedCode,
    );
    if (soldUnit) {
      const manual = state.manualById.get(soldUnit.manualId);
      if (manual) {
        return {
          manual,
          manualCode: soldUnit.manualCode,
          source: "soldUnit",
        };
      }
    }

    const manual = state.manuals.find(
      (entry) => entry._manualCodeNormalized === normalizedCode,
    );
    if (manual) {
      return {
        manual,
        manualCode: manual.manualCode || "",
        source: "manual",
      };
    }

    return null;
  }

  function fuzzySearchManuals(query) {
    const tokens = tokenize(query);
    if (!tokens.length) {
      return [...state.manuals];
    }

    const queryLower = query.toLowerCase();

    return state.manuals
      .map((manual) => {
        let score = 0;
        if (manual._searchText.includes(queryLower)) {
          score += 8;
        }

        for (const token of tokens) {
          if (manual._searchText.includes(token)) {
            score += 2;
          }
        }

        if (
          manual._manualCodeNormalized &&
          manual._manualCodeNormalized.includes(normalize(query))
        ) {
          score += 5;
        }

        return { manual, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return (
          new Date(b.manual.updatedAt).getTime() -
          new Date(a.manual.updatedAt).getTime()
        );
      })
      .map((row) => row.manual);
  }

  function renderManualResults(manuals, activeId) {
    els.manualSearchResults.innerHTML = "";
    els.searchResultCount.textContent = `${manuals.length} ${manuals.length === 1 ? "file" : "files"}`;

    manuals.forEach((manual, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `manual-result${manual.id === activeId ? " is-active" : ""}`;
      button.setAttribute("data-manual-id", manual.id);
      const presentation = getManualPresentation(manual);
      button.setAttribute(
        "aria-label",
        `${presentation.title}${presentation.era ? `, ${presentation.era}` : ""}`,
      );
      button.style.setProperty("--result-index", index);
      button.innerHTML = `
        <span class="result-file-icon" aria-hidden="true"></span>
        <span class="result-copy">
          <span class="result-title">${escapeHtml(presentation.title)}</span>
          ${presentation.era ? `<span class="result-era">${escapeHtml(presentation.era)}</span>` : ""}
        </span>
      `;
      button.addEventListener("click", () => {
        selectManual(manual.id, {
          from: "results",
          manualCode: manual.manualCode || null,
        });
      });

      li.appendChild(button);
      els.manualSearchResults.appendChild(li);
    });
  }

  function getRecentSoldUnits() {
    const limit = Number(state.config.recentLimit) || 8;
    const days = state.config.hideSoldOlderThanDays;
    const now = Date.now();

    let list = [...state.soldUnits];
    if (typeof days === "number" && days > 0) {
      const maxAgeMs = days * 24 * 60 * 60 * 1000;
      list = list.filter((unit) => {
        const age = now - new Date(unit.soldDate).getTime();
        return age <= maxAgeMs;
      });
    }

    return list.slice(0, limit);
  }

  function renderRecentUnits(activeManualCode) {
    const recentUnits = getRecentSoldUnits();
    els.recentUnitsList.innerHTML = "";
    els.recentCount.textContent = `${recentUnits.length} shown`;

    recentUnits.forEach((unit) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";

      const isActive =
        activeManualCode &&
        normalize(activeManualCode) === unit._manualCodeNormalized;
      button.className = `recent-unit${isActive ? " is-active" : ""}`;
      const manual = state.manualById.get(unit.manualId);
      const presentation = manual ? getManualPresentation(manual) : null;
      button.innerHTML = `
        <span class="result-file-icon result-unit-icon" aria-hidden="true"></span>
        <span class="result-copy">
          <span class="result-title">${escapeHtml(unit.itemName || presentation?.title || "Sold unit")}</span>
          <span class="result-meta">${formatDate(unit.soldDate)} · ${escapeHtml(unit.platform)}${unit.serial ? ` · S/N ${escapeHtml(unit.serial)}` : ""}</span>
        </span>
      `;

      button.addEventListener("click", () => {
        selectManual(unit.manualId, {
          from: "recent",
          manualCode: unit.manualCode,
        });
      });

      if (unit.listingUrl) {
        button.title = `Open listing: ${unit.listingUrl}`;
      }

      li.appendChild(button);
      els.recentUnitsList.appendChild(li);
    });
  }

  function updateManualJsonLd(manual) {
    if (!manual) {
      els.manualJsonld.textContent = "{}";
      return;
    }

    const shareUrl = `${window.location.origin}/manuals/?m=${encodeURIComponent(manual.id)}`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: `${manual.title} Manual`,
      name: `${manual.title} Manual`,
      about: `${manual.brand} ${manual.model}`,
      keywords: (manual.tags || []).join(", "),
      datePublished: manual.createdAt,
      dateModified: manual.updatedAt,
      url: shareUrl,
      publisher: {
        "@type": "Organization",
        name: "Otorlymern Electrical Systems",
        url: "https://otorlymern-electrical.com/",
      },
      mainEntityOfPage: shareUrl,
      associatedMedia: {
        "@type": "MediaObject",
        contentUrl: resolveAssetUrl(manual.pdfUrl, state.config.assetBaseUrl),
      },
    };

    els.manualJsonld.textContent = JSON.stringify(jsonLd, null, 2);
  }

  function updateManualMeta(manual, manualCodeOverride) {
    els.manualTitle.textContent = manual.title;
    els.manualBrand.textContent = manual.brand;
    els.manualModel.textContent = manual.model;
    els.manualCode.textContent =
      manualCodeOverride || manual.manualCode || "Not assigned";
    els.manualUpdated.textContent = formatDate(manual.updatedAt);
    els.manualNotes.textContent = manual.notes || "";

    const shareUrl = `${window.location.origin}/manuals/?m=${encodeURIComponent(manual.id)}`;
    els.copyShareButton.setAttribute("data-share-url", shareUrl);
    els.openPdfExternal.href = resolveAssetUrl(
      manual.pdfUrl,
      state.config.assetBaseUrl,
    );

    const serviceUrl = new URL(
      "/services/repairrequest.html",
      window.location.origin,
    );
    serviceUrl.searchParams.set("brand", manual.brand);
    serviceUrl.searchParams.set("model", manual.model);
    if (manualCodeOverride || manual.manualCode) {
      serviceUrl.searchParams.set(
        "manualCode",
        manualCodeOverride || manual.manualCode,
      );
    }
    serviceUrl.searchParams.set("source", "manuals-archive");
    if (els.serviceButton) {
      els.serviceButton.href = `${serviceUrl.pathname}?${serviceUrl.searchParams.toString()}`;
    }

    updateManualJsonLd(manual);
  }

  async function loadPdfJsIfNeeded() {
    if (window.pdfjsLib) {
      return window.pdfjsLib;
    }

    if (state.pdfJsReadyPromise) {
      return state.pdfJsReadyPromise;
    }

    state.pdfJsReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PDFJS_LIB_URL;
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error("PDF.js script loaded without pdfjsLib"));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error("Failed to load PDF.js"));
      document.head.appendChild(script);
    });

    return state.pdfJsReadyPromise;
  }

  async function renderPdfPage() {
    if (!state.pdfDoc) {
      return;
    }

    const page = await state.pdfDoc.getPage(state.pageNum);
    const canvas = els.pdfCanvas;
    const context = canvas.getContext("2d", { alpha: false });
    const baseViewport = page.getViewport({ scale: 1 });

    const availableWidth = Math.max(320, els.pdfCanvasWrap.clientWidth - 18);
    const fitScale = (availableWidth / baseViewport.width) * state.zoomFactor;
    const viewport = page.getViewport({ scale: fitScale });

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    els.pageIndicator.textContent = `Page ${state.pageNum} / ${state.pdfDoc.numPages}`;
    els.zoomIndicator.textContent = `${Math.round(state.zoomFactor * 100)}%`;

    els.prevPageButton.disabled = state.pageNum <= 1;
    els.nextPageButton.disabled = state.pageNum >= state.pdfDoc.numPages;
  }

  async function showPdfWithPdfJs(pdfUrl) {
    const pdfjsLib = await loadPdfJsIfNeeded();

    if (state.currentPdfUrl !== pdfUrl) {
      state.currentPdfUrl = pdfUrl;
      state.pageNum = 1;
      state.zoomFactor = 1;
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      state.pdfDoc = await loadingTask.promise;
    }

    els.viewerEmpty.classList.add("is-hidden");
    els.pdfFallback.classList.add("is-hidden");
    els.pdfJsContainer.classList.remove("is-hidden");

    await renderPdfPage();
  }

  function showPdfFallback(pdfUrl) {
    state.pdfDoc = null;
    state.currentPdfUrl = pdfUrl;
    els.viewerEmpty.classList.add("is-hidden");
    els.pdfJsContainer.classList.add("is-hidden");
    els.pdfFallback.classList.remove("is-hidden");
    els.pdfFallback.src = pdfUrl;
  }

  function useIframeFallback(pdfUrl, message) {
    if (pdfUrl) {
      showPdfFallback(pdfUrl);
    }
    if (message) {
      updateStatus(message);
    }
  }

  async function openManualPdf(pdfUrl) {
    try {
      await showPdfWithPdfJs(pdfUrl);
    } catch (err) {
      useIframeFallback(
        pdfUrl,
        "PDF.js unavailable, using embedded PDF fallback.",
      );
    }
  }

  function applySearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      state.filteredManuals = [...state.manuals].sort((a, b) => {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
      updateStatus(`Showing all archive documents (${state.filteredManuals.length}).`);
      return;
    }

    const exact = findExactManualCodeMatch(normalize(trimmed));
    if (exact) {
      state.filteredManuals = [exact.manual];
      updateStatus(
        `Exact code match from ${exact.source === "soldUnit" ? "sold unit" : "manual"}: ${exact.manualCode || exact.manual.manualCode}`,
      );
      return;
    }

    state.filteredManuals = fuzzySearchManuals(trimmed);
    if (!state.filteredManuals.length) {
      updateStatus("No archive documents matched that query.");
    } else {
      updateStatus(
        `Found ${state.filteredManuals.length} matching archive document${state.filteredManuals.length === 1 ? "" : "s"}.`,
      );
    }
  }

  async function selectManual(manualId, options = {}) {
    const manual = state.manualById.get(manualId);
    if (!manual) {
      return;
    }

    state.selectedManualId = manual.id;
    state.selectedManualCode = options.manualCode || manual.manualCode || null;

    updateManualMeta(manual, state.selectedManualCode);
    renderManualResults(state.filteredManuals, manual.id);
    renderRecentUnits(state.selectedManualCode);

    writeManualIdToLocation(manual.id);
    setSelectedManualInStorage(manual.id);

    const resolvedPdfUrl = resolveAssetUrl(
      manual.pdfUrl,
      state.config.assetBaseUrl,
    );
    await openManualPdf(resolvedPdfUrl);
  }

  function bindUiEvents() {
    els.sidebarToggle.addEventListener("click", () => {
      const open = !els.archiveSidebar.classList.contains("is-open");
      els.archiveSidebar.classList.toggle("is-open", open);
      els.sidebarToggle.setAttribute("aria-expanded", String(open));
    });

    els.manualSearchInput.addEventListener("input", () => {
      applySearch(els.manualSearchInput.value);
      renderManualResults(state.filteredManuals, state.selectedManualId);
    });

    els.manualSearchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = els.manualSearchInput.value.trim();
      if (!query) {
        applySearch("");
        renderManualResults(state.filteredManuals, state.selectedManualId);
        return;
      }

      const exact = findExactManualCodeMatch(normalize(query));
      if (exact) {
        await selectManual(exact.manual.id, {
          from: "search",
          manualCode: exact.manualCode,
        });
        return;
      }

      applySearch(query);
      renderManualResults(state.filteredManuals, state.selectedManualId);
      if (state.filteredManuals[0]) {
        await selectManual(state.filteredManuals[0].id, {
          from: "search-fuzzy",
          manualCode: state.filteredManuals[0].manualCode || null,
        });
      }
    });

    els.copyShareButton.addEventListener("click", async () => {
      const shareUrl = els.copyShareButton.getAttribute("data-share-url");
      if (!shareUrl) {
        return;
      }

      const previous = els.copyShareButton.textContent;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          const input = document.createElement("input");
          input.value = shareUrl;
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
        }
        els.copyShareButton.textContent = "Copied";
      } catch (_) {
        els.copyShareButton.textContent = "Copy failed";
      }
      window.setTimeout(() => {
        els.copyShareButton.textContent = previous;
      }, 1200);
    });

    els.prevPageButton.addEventListener("click", async () => {
      if (!state.pdfDoc || state.pageNum <= 1) {
        return;
      }
      state.pageNum -= 1;
      try {
        await renderPdfPage();
      } catch (err) {
        useIframeFallback(
          state.currentPdfUrl,
          "PDF render error. Switched to embedded PDF fallback.",
        );
      }
    });

    els.nextPageButton.addEventListener("click", async () => {
      if (!state.pdfDoc || state.pageNum >= state.pdfDoc.numPages) {
        return;
      }
      state.pageNum += 1;
      try {
        await renderPdfPage();
      } catch (err) {
        useIframeFallback(
          state.currentPdfUrl,
          "PDF render error. Switched to embedded PDF fallback.",
        );
      }
    });

    els.zoomOutButton.addEventListener("click", async () => {
      if (!state.pdfDoc) {
        return;
      }
      state.zoomFactor = Math.max(0.6, state.zoomFactor - 0.1);
      try {
        await renderPdfPage();
      } catch (err) {
        useIframeFallback(
          state.currentPdfUrl,
          "PDF render error. Switched to embedded PDF fallback.",
        );
      }
    });

    els.zoomInButton.addEventListener("click", async () => {
      if (!state.pdfDoc) {
        return;
      }
      state.zoomFactor = Math.min(2.4, state.zoomFactor + 0.1);
      try {
        await renderPdfPage();
      } catch (err) {
        useIframeFallback(
          state.currentPdfUrl,
          "PDF render error. Switched to embedded PDF fallback.",
        );
      }
    });

    window.addEventListener("resize", () => {
      if (state.pdfDoc) {
        window.requestAnimationFrame(() => {
          renderPdfPage().catch(() => {
            useIframeFallback(
              state.currentPdfUrl,
              "PDF render error. Switched to embedded PDF fallback.",
            );
          });
        });
      }
    });

    els.emailSignupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = els.signupEmail.value.trim();
      if (!email) {
        return;
      }

      const subject = encodeURIComponent("OES updates signup");
      const body = encodeURIComponent(
        `Please add this email to OES updates: ${email}`,
      );
      window.location.href = `mailto:info@otorlymern-electrical.com?subject=${subject}&body=${body}`;
    });
  }

  function normalizeData(raw) {
    state.archiveData = raw;
    state.config = {
      ...state.config,
      ...(raw.config || {}),
    };

    state.manuals = (raw.manuals || []).map((manual) => {
      const entry = {
        ...manual,
        tags: manual.tags || [],
      };
      entry._manualCodeNormalized = normalize(entry.manualCode || "");
      entry._searchText = [
        entry.title,
        entry.brand,
        entry.model,
        entry.manualCode,
        ...(entry.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return entry;
    });

    state.soldUnits = (raw.soldUnits || [])
      .map((unit) => ({
        ...unit,
        _manualCodeNormalized: normalize(unit.manualCode),
      }))
      .sort(
        (a, b) =>
          new Date(b.soldDate).getTime() - new Date(a.soldDate).getTime(),
      );

    state.manualById = new Map(
      state.manuals.map((manual) => [manual.id, manual]),
    );
  }

  async function loadData() {
    const baseResponse = await fetch(ARCHIVE_JSON_PATH);
    if (!baseResponse.ok) {
      throw new Error(`Failed to load archive data: ${baseResponse.status}`);
    }

    const baseData = await baseResponse.json();
    const versionedUrl = getDataUrlWithVersion(
      baseData && baseData.config && baseData.config.dataVersion,
    );
    let data = baseData;
    if (versionedUrl !== ARCHIVE_JSON_PATH) {
      const versionedResponse = await fetch(versionedUrl);
      if (versionedResponse.ok) {
        data = await versionedResponse.json();
      }
    }

    normalizeData(data);
  }

  async function initialize() {
    Object.assign(els, {
      sidebarToggle: getEl("sidebarToggle"),
      archiveSidebar: getEl("archiveSidebar"),
      manualSearchForm: getEl("manualSearchForm"),
      manualSearchInput: getEl("manualSearchInput"),
      manualSearchResults: getEl("manualSearchResults"),
      searchResultCount: getEl("searchResultCount"),
      searchStatus: getEl("searchStatus"),
      recentUnitsList: getEl("recentUnitsList"),
      recentCount: getEl("recentCount"),
      serviceButton: getEl("serviceButton"),
      emailSignupForm: getEl("emailSignupForm"),
      signupEmail: getEl("signupEmail"),

      manualTitle: getEl("manualTitle"),
      manualBrand: getEl("manualBrand"),
      manualModel: getEl("manualModel"),
      manualCode: getEl("manualCode"),
      manualUpdated: getEl("manualUpdated"),
      manualNotes: getEl("manualNotes"),
      copyShareButton: getEl("copyShareButton"),
      openPdfExternal: getEl("openPdfExternal"),

      viewerEmpty: getEl("viewerEmpty"),
      pdfJsContainer: getEl("pdfJsContainer"),
      pdfCanvasWrap: getEl("pdfCanvasWrap"),
      pdfCanvas: getEl("pdfCanvas"),
      pdfFallback: getEl("pdfFallback"),
      prevPageButton: getEl("prevPageButton"),
      nextPageButton: getEl("nextPageButton"),
      zoomOutButton: getEl("zoomOutButton"),
      zoomInButton: getEl("zoomInButton"),
      pageIndicator: getEl("pageIndicator"),
      zoomIndicator: getEl("zoomIndicator"),

      manualJsonld: getEl("manual-jsonld"),
    });

    bindUiEvents();

    try {
      await loadData();
    } catch (error) {
      updateStatus("Could not load archive data. Please contact OES support.");
      els.viewerEmpty.textContent = "Archive data failed to load.";
      return;
    }

    applySearch("");
    renderManualResults(state.filteredManuals, null);
    renderRecentUnits(null);

    const urlManualId = readManualIdFromLocation();
    const storedManualId = getStoredManualId();
    const defaultId =
      state.config.defaultManualId || (state.manuals[0] && state.manuals[0].id);

    const startupId =
      (urlManualId && state.manualById.has(urlManualId) && urlManualId) ||
      (storedManualId &&
        state.manualById.has(storedManualId) &&
        storedManualId) ||
      defaultId;

    if (startupId) {
      await selectManual(startupId, {
        from: "startup",
      });
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    initialize().catch(() => {
      updateStatus("Initialization failed. Please refresh or contact OES.");
    });
  });
})();
