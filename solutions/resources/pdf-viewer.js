(() => {
  const PDFJS_LIB_URL = "/manuals/vendor/pdfjs/pdf.min.js";
  const PDFJS_WORKER_URL = "/manuals/vendor/pdfjs/pdf.worker.min.js";
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.15;

  const viewerWindow = document.querySelector('[data-window="pdf-viewer"]');
  const viewer = viewerWindow?.querySelector("[data-pdf-viewer]");

  if (!viewerWindow || !viewer) {
    return;
  }

  const els = {
    previous: viewer.querySelector("[data-pdf-previous]"),
    next: viewer.querySelector("[data-pdf-next]"),
    page: viewer.querySelector("[data-pdf-page]"),
    zoomOut: viewer.querySelector("[data-pdf-zoom-out]"),
    zoomIn: viewer.querySelector("[data-pdf-zoom-in]"),
    zoom: viewer.querySelector("[data-pdf-zoom]"),
    fit: viewer.querySelector("[data-pdf-fit]"),
    title: viewer.querySelector("[data-pdf-document-title]"),
    viewport: viewer.querySelector("[data-pdf-viewport]"),
    message: viewer.querySelector("[data-pdf-message]"),
    canvas: viewer.querySelector("[data-pdf-canvas]"),
    fallback: viewer.querySelector("[data-pdf-fallback]"),
    status: viewerWindow.querySelector("[data-pdf-status]"),
    mode: viewerWindow.querySelector("[data-pdf-mode]"),
  };

  const state = {
    document: null,
    loadingTask: null,
    renderTask: null,
    pageNumber: 1,
    zoomFactor: 1,
    requestId: 0,
    pdfJsPromise: null,
    currentUrl: "",
    currentTitle: "",
    resizeTimer: 0,
  };

  const setControlsEnabled = (enabled) => {
    els.previous.disabled = !enabled || state.pageNumber <= 1;
    els.next.disabled =
      !enabled || !state.document || state.pageNumber >= state.document.numPages;
    els.zoomOut.disabled = !enabled || state.zoomFactor <= MIN_ZOOM;
    els.zoomIn.disabled = !enabled || state.zoomFactor >= MAX_ZOOM;
    els.fit.disabled = !enabled;
  };

  const updateReadout = () => {
    const pageCount = state.document?.numPages;
    els.page.textContent = pageCount
      ? `Page ${state.pageNumber} / ${pageCount}`
      : "Page – / –";
    els.zoom.textContent = `${Math.round(state.zoomFactor * 100)}%`;
    setControlsEnabled(Boolean(state.document));
  };

  const showMessage = (copy) => {
    const label = els.message.querySelector("strong");
    if (label) {
      label.textContent = copy;
    }
    els.message.hidden = false;
    els.canvas.hidden = true;
    els.fallback.hidden = true;
    els.viewport.classList.remove("is-fallback");
  };

  const loadPdfJs = () => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return Promise.resolve(window.pdfjsLib);
    }

    if (state.pdfJsPromise) {
      return state.pdfJsPromise;
    }

    state.pdfJsPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${PDFJS_LIB_URL}"]`);
      const script = existingScript || document.createElement("script");

      const handleLoad = () => {
        if (!window.pdfjsLib) {
          reject(new Error("PDF.js loaded without exposing its viewer library."));
          return;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        resolve(window.pdfjsLib);
      };

      const handleError = () => {
        reject(new Error("The OES PDF renderer could not be loaded."));
      };

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });

      if (!existingScript) {
        script.src = PDFJS_LIB_URL;
        script.defer = true;
        document.head.append(script);
      }
    }).catch((error) => {
      state.pdfJsPromise = null;
      throw error;
    });

    return state.pdfJsPromise;
  };

  const cancelCurrentWork = async () => {
    if (state.renderTask) {
      state.renderTask.cancel();
      state.renderTask = null;
    }

    if (state.loadingTask) {
      await Promise.resolve(state.loadingTask.destroy()).catch(() => {});
      state.loadingTask = null;
    }

    if (state.document) {
      await state.document.destroy().catch(() => {});
      state.document = null;
    }
  };

  const showFallback = (url, title) => {
    els.message.hidden = true;
    els.canvas.hidden = true;
    els.fallback.src = url;
    els.fallback.title = `${title} — embedded PDF`;
    els.fallback.hidden = false;
    els.viewport.classList.add("is-fallback");
    els.status.textContent = `${title} · embedded viewer`;
    els.mode.textContent = "Browser PDF mode";
    updateReadout();
  };

  const renderPage = async () => {
    if (!state.document) {
      return;
    }

    const activeDocument = state.document;
    const activeRequest = state.requestId;
    const pageNumber = state.pageNumber;
    let activeRenderTask = null;

    if (state.renderTask) {
      state.renderTask.cancel();
      state.renderTask = null;
    }

    els.status.textContent = `Rendering page ${pageNumber}…`;

    try {
      const page = await activeDocument.getPage(pageNumber);
      if (activeRequest !== state.requestId || activeDocument !== state.document) {
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(240, els.viewport.clientWidth - 32);
      const fitScale = availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: fitScale * state.zoomFactor });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const context = els.canvas.getContext("2d", { alpha: false });

      els.canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      els.canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      els.canvas.style.width = `${Math.floor(viewport.width)}px`;
      els.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const renderContext = {
        canvasContext: context,
        viewport,
        ...(outputScale === 1
          ? {}
          : { transform: [outputScale, 0, 0, outputScale, 0, 0] }),
      };

      activeRenderTask = page.render(renderContext);
      state.renderTask = activeRenderTask;
      await activeRenderTask.promise;

      if (activeRequest !== state.requestId || activeDocument !== state.document) {
        return;
      }

      if (state.renderTask === activeRenderTask) {
        state.renderTask = null;
      }
      els.message.hidden = true;
      els.fallback.hidden = true;
      els.canvas.hidden = false;
      els.viewport.classList.remove("is-fallback");
      els.status.textContent = `${state.currentTitle} · page ${pageNumber} of ${activeDocument.numPages}`;
      els.mode.textContent = "PDF.js canvas mode";
      updateReadout();
    } catch (error) {
      if (state.renderTask === activeRenderTask) {
        state.renderTask = null;
      }
      if (error?.name === "RenderingCancelledException") {
        return;
      }

      console.warn("OES PDF Viewer could not render this page:", error);
      showFallback(state.currentUrl, state.currentTitle);
    }
  };

  const openPdf = async ({ url, title = "Archive document" } = {}) => {
    if (!url) {
      return;
    }

    const requestId = ++state.requestId;
    state.currentUrl = new URL(url, window.location.href).href;
    state.currentTitle = String(title).trim() || "Archive document";
    state.pageNumber = 1;
    state.zoomFactor = 1;

    document.dispatchEvent(
      new CustomEvent("oes:open-window", {
        detail: { app: "pdf-viewer" },
      })
    );

    els.title.textContent = state.currentTitle;
    els.status.textContent = `Opening ${state.currentTitle}…`;
    els.mode.textContent = "Loading PDF.js";
    els.fallback.removeAttribute("src");
    showMessage(`Opening ${state.currentTitle}…`);
    updateReadout();

    await cancelCurrentWork();
    if (requestId !== state.requestId) {
      return;
    }

    try {
      const pdfjsLib = await loadPdfJs();
      if (requestId !== state.requestId) {
        return;
      }

      state.loadingTask = pdfjsLib.getDocument(state.currentUrl);
      const loadedDocument = await state.loadingTask.promise;

      if (requestId !== state.requestId) {
        await loadedDocument.destroy().catch(() => {});
        return;
      }

      state.loadingTask = null;
      state.document = loadedDocument;
      updateReadout();
      await renderPage();
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }

      state.loadingTask = null;
      console.warn("OES PDF Viewer is using its embedded fallback:", error);
      showFallback(state.currentUrl, state.currentTitle);
    }
  };

  els.previous.addEventListener("click", () => {
    if (!state.document || state.pageNumber <= 1) {
      return;
    }

    state.pageNumber -= 1;
    updateReadout();
    renderPage();
  });

  els.next.addEventListener("click", () => {
    if (!state.document || state.pageNumber >= state.document.numPages) {
      return;
    }

    state.pageNumber += 1;
    updateReadout();
    renderPage();
  });

  els.zoomOut.addEventListener("click", () => {
    state.zoomFactor = Math.max(MIN_ZOOM, state.zoomFactor - ZOOM_STEP);
    updateReadout();
    renderPage();
  });

  els.zoomIn.addEventListener("click", () => {
    state.zoomFactor = Math.min(MAX_ZOOM, state.zoomFactor + ZOOM_STEP);
    updateReadout();
    renderPage();
  });

  els.fit.addEventListener("click", () => {
    state.zoomFactor = 1;
    updateReadout();
    renderPage();
  });

  document.addEventListener("oes:open-pdf", (event) => {
    openPdf(event.detail);
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest(".resource-list a[href]");
    if (
      !link ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const url = new URL(link.href, window.location.href);
    if (!url.pathname.toLowerCase().endsWith(".pdf")) {
      return;
    }

    event.preventDefault();
    openPdf({
      url: url.href,
      title: link.textContent.trim() || "Archive document",
    });
  });

  const resizeObserver = new ResizeObserver(() => {
    if (!state.document || viewerWindow.hidden) {
      return;
    }

    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(renderPage, 160);
  });
  resizeObserver.observe(els.viewport);
})();
