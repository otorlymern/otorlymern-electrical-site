(() => {
  const ARCHIVE_JSON_PATH = "/manuals/data/archive.json";
  const PAGE_SIZE = 180;
  const numberFormatter = new Intl.NumberFormat("en-US");
  const titleCollator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
  });

  const collectionMeta = new Map([
    ["manuals", { label: "Equipment Manuals", shortLabel: "Manuals" }],
    ["books", { label: "Books & Reading", shortLabel: "Books" }],
    ["service-schems", { label: "Service & Schematics", shortLabel: "Service" }],
    ["diy", { label: "DIY Electronics", shortLabel: "DIY" }],
    ["video-docs", { label: "Video Documents", shortLabel: "Video" }],
    [
      "engineering-recording-techniques",
      { label: "Recording Techniques", shortLabel: "Recording" },
    ],
    ["resources", { label: "Resources & Articles", shortLabel: "Resources" }],
    ["analog-computing", { label: "Analog Computing", shortLabel: "Computing" }],
    ["microphones", { label: "Microphones", shortLabel: "Microphones" }],
    ["other", { label: "Other Files", shortLabel: "Other" }],
  ]);

  const collectionOrder = [
    "manuals",
    "books",
    "service-schems",
    "diy",
    "video-docs",
    "engineering-recording-techniques",
    "resources",
    "analog-computing",
    "microphones",
    "other",
  ];

  const explorerWindow = document.querySelector('[data-window="archive-explorer"]');
  const explorer = explorerWindow?.querySelector("[data-archive-explorer]");

  if (!explorerWindow || !explorer) {
    return;
  }

  const els = {
    back: explorer.querySelector("[data-archive-back]"),
    up: explorer.querySelector("[data-archive-up]"),
    clear: explorer.querySelector("[data-archive-clear]"),
    searchForm: explorer.querySelector("[data-archive-search]"),
    searchInput: explorer.querySelector("[data-archive-search-input]"),
    path: explorer.querySelector("[data-archive-path]"),
    tree: explorer.querySelector("[data-archive-tree]"),
    rootTreeItem: explorer.querySelector('[data-archive-folder="root"]'),
    filePane: explorer.querySelector(".archive-file-pane"),
    heading: explorer.querySelector("[data-archive-heading]"),
    summary: explorer.querySelector("[data-archive-summary]"),
    view: explorer.querySelector("[data-archive-view]"),
    status: explorerWindow.querySelector("[data-archive-status]"),
    version: explorerWindow.querySelector("[data-archive-version]"),
  };

  const state = {
    loaded: false,
    loadPromise: null,
    manuals: [],
    collections: new Map(),
    brands: new Map(),
    history: [],
    view: { kind: "root" },
    visibleLimit: PAGE_SIZE,
    visibleDocuments: [],
  };

  const countLabel = (value, singular = "file") =>
    `${numberFormatter.format(value)} ${value === 1 ? singular : `${singular}s`}`;

  const normalize = (value) =>
    (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  const collectionIdFromUrl = (rawUrl) => {
    try {
      const url = new URL(rawUrl, window.location.origin);
      const archivePath = url.pathname.split("/pdfs/")[1] || "";
      return archivePath.split("/").filter(Boolean)[0] || "other";
    } catch (_) {
      return "other";
    }
  };

  const resolvePdfUrl = (manual, assetBaseUrl) => {
    if (!manual.pdfUrl) {
      return "";
    }

    if (/^https?:\/\//i.test(manual.pdfUrl)) {
      return manual.pdfUrl;
    }

    const base = (assetBaseUrl || "").replace(/\/$/, "");
    if (!base) {
      return manual.pdfUrl;
    }

    return manual.pdfUrl.startsWith("/")
      ? `${base}${manual.pdfUrl}`
      : `${base}/${manual.pdfUrl}`;
  };

  const sortDocuments = (documents) =>
    [...documents].sort((a, b) =>
      titleCollator.compare(a.displayTitle, b.displayTitle)
    );

  const folderDefinitions = () => {
    const folders = [
      {
        kind: "all",
        id: "",
        label: "All Documents",
        count: state.manuals.length,
      },
    ];

    collectionOrder.forEach((id) => {
      const documents = state.collections.get(id) || [];
      if (!documents.length) {
        return;
      }

      folders.push({
        kind: "collection",
        id,
        label: collectionMeta.get(id)?.label || id,
        count: documents.length,
      });
    });

    folders.push({
      kind: "brands",
      id: "",
      label: "Manufacturers",
      count: state.brands.size,
      countType: "folder",
    });

    return folders;
  };

  const createFolderIcon = (className = "archive-folder-icon") => {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  };

  const createFolderCard = ({ kind, id = "", label, count, countType = "file" }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-folder-card";
    button.dataset.archiveKind = kind;
    button.dataset.archiveId = id;
    button.append(createFolderIcon());

    const copy = document.createElement("span");
    copy.className = "archive-folder-card__copy";

    const name = document.createElement("strong");
    name.textContent = label;

    const countText = document.createElement("small");
    countText.textContent = countLabel(count, countType);

    copy.append(name, countText);
    button.append(copy);
    return button;
  };

  const createTreeItem = ({ kind, id = "", label, count }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-tree__item";
    button.dataset.archiveKind = kind;
    button.dataset.archiveId = id;
    button.append(createFolderIcon("archive-tree__folder"));

    const name = document.createElement("span");
    name.textContent = label;

    const countText = document.createElement("span");
    countText.className = "archive-tree__item-count";
    countText.textContent = numberFormatter.format(count);

    button.append(name, countText);
    return button;
  };

  const renderTree = () => {
    els.tree.replaceChildren();
    folderDefinitions().forEach((folder) => {
      els.tree.append(createTreeItem(folder));
    });
  };

  const viewLabel = (view) => {
    if (view.kind === "all") {
      return "All Documents";
    }

    if (view.kind === "collection") {
      return collectionMeta.get(view.id)?.label || view.id;
    }

    if (view.kind === "brands") {
      return "Manufacturers";
    }

    if (view.kind === "brand") {
      return view.id;
    }

    if (view.kind === "search") {
      return `Search Results: ${view.query}`;
    }

    return "OES Archive (C:)";
  };

  const parentViewFor = (view) => {
    if (view.kind === "brand") {
      return { kind: "brands" };
    }

    if (view.kind !== "root") {
      return { kind: "root" };
    }

    return null;
  };

  const isViewMatch = (button, view) =>
    button.dataset.archiveKind === view.kind &&
    (button.dataset.archiveId || "") === (view.id || "");

  const updateNavigation = () => {
    const label = viewLabel(state.view);
    const parent = parentViewFor(state.view);

    els.path.textContent =
      state.view.kind === "root"
        ? "OES Archive (C:)\\"
        : `OES Archive (C:)\\${label}`;
    els.back.disabled = state.history.length === 0;
    els.up.disabled = !parent;
    els.rootTreeItem.classList.toggle("is-active", state.view.kind === "root");

    els.tree.querySelectorAll("[data-archive-kind]").forEach((button) => {
      button.classList.toggle("is-active", isViewMatch(button, state.view));
    });

    if (state.view.kind === "search") {
      els.searchInput.value = state.view.query;
    }
  };

  const documentsForView = (view) => {
    if (view.kind === "all") {
      return sortDocuments(state.manuals);
    }

    if (view.kind === "collection") {
      return sortDocuments(state.collections.get(view.id) || []);
    }

    if (view.kind === "brand") {
      return sortDocuments(state.brands.get(view.id) || []);
    }

    if (view.kind === "search") {
      return searchDocuments(view.query);
    }

    return [];
  };

  const searchDocuments = (query) => {
    const normalizedQuery = normalize(query).trim();
    const tokens = normalizedQuery.split(/[^a-z0-9-]+/).filter(Boolean);
    if (!tokens.length) {
      return sortDocuments(state.manuals);
    }

    return state.manuals
      .map((manual) => {
        let score = 0;
        if (manual.searchText.includes(normalizedQuery)) {
          score += 12;
        }

        tokens.forEach((token) => {
          if (manual.searchText.includes(token)) {
            score += 3;
          }
          if (normalize(manual.brand).startsWith(token)) {
            score += 2;
          }
          if (normalize(manual.displayTitle).startsWith(token)) {
            score += 2;
          }
        });

        return { manual, score };
      })
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          titleCollator.compare(a.manual.displayTitle, b.manual.displayTitle)
      )
      .map(({ manual }) => manual);
  };

  const createFileRow = (manual) => {
    const row = document.createElement("div");
    row.className = "archive-file-row";
    row.setAttribute("role", "listitem");

    const link = document.createElement("a");
    link.className = "archive-file-row__name";
    link.href = manual.resolvedPdfUrl;
    link.title = `Read ${manual.displayTitle} in OES PDF Viewer`;
    link.append(document.createElement("span"));
    link.firstElementChild.className = "archive-pdf-icon";
    link.firstElementChild.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.textContent = manual.displayTitle;
    link.append(name);

    const brand = document.createElement("span");
    brand.textContent = manual.brand || "Unknown";
    brand.title = brand.textContent;

    const folder = document.createElement("span");
    folder.textContent =
      collectionMeta.get(manual.collectionId)?.shortLabel || manual.model || "Archive";
    folder.title = manual.model || folder.textContent;

    const type = document.createElement("span");
    type.className = "archive-file-row__type";
    type.textContent = "PDF";

    link.addEventListener("click", (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      els.status.textContent = `Opening ${manual.displayTitle} in OES PDF Viewer`;
      document.dispatchEvent(
        new CustomEvent("oes:open-pdf", {
          detail: {
            url: manual.resolvedPdfUrl,
            title: manual.displayTitle,
            brand: manual.brand || "",
            model: manual.model || "",
          },
        })
      );
    });

    row.append(link, brand, folder, type);
    return row;
  };

  const renderFolderView = (folders, heading, summary) => {
    els.filePane.classList.add("is-folder-view");
    els.heading.textContent = heading;
    els.summary.textContent = summary;
    els.view.replaceChildren();

    const grid = document.createElement("div");
    grid.className = "archive-folder-grid";
    folders.forEach((folder) => grid.append(createFolderCard(folder)));
    els.view.append(grid);
    els.status.textContent = `${countLabel(folders.length, "folder")} · ${countLabel(state.manuals.length)}`;
  };

  const renderDocumentView = (documents) => {
    els.filePane.classList.remove("is-folder-view");
    els.heading.textContent = viewLabel(state.view);
    els.summary.textContent = countLabel(documents.length);
    els.view.replaceChildren();
    state.visibleDocuments = documents;

    if (!documents.length) {
      const empty = document.createElement("div");
      empty.className = "archive-empty";
      empty.textContent = "No PDF files match this view.";
      els.view.append(empty);
      els.status.textContent = "0 files";
      return;
    }

    const visibleDocuments = documents.slice(0, state.visibleLimit);
    const fragment = document.createDocumentFragment();
    visibleDocuments.forEach((manual) => fragment.append(createFileRow(manual)));
    els.view.append(fragment);

    if (visibleDocuments.length < documents.length) {
      const loadMore = document.createElement("button");
      loadMore.type = "button";
      loadMore.className = "archive-load-more oes-button";
      loadMore.dataset.archiveLoadMore = "";
      loadMore.textContent = `Show more files (${numberFormatter.format(
        documents.length - visibleDocuments.length
      )} remaining)`;
      els.view.append(loadMore);
    }

    els.status.textContent =
      visibleDocuments.length === documents.length
        ? countLabel(documents.length)
        : `Showing ${numberFormatter.format(visibleDocuments.length)} of ${numberFormatter.format(
            documents.length
          )} files`;
  };

  const renderView = () => {
    updateNavigation();

    if (state.view.kind === "root") {
      renderFolderView(
        folderDefinitions(),
        "OES Archive (C:)",
        `${countLabel(state.manuals.length)} indexed`
      );
      return;
    }

    if (state.view.kind === "brands") {
      const brandFolders = [...state.brands.entries()]
        .map(([label, documents]) => ({
          kind: "brand",
          id: label,
          label,
          count: documents.length,
        }))
        .sort((a, b) => titleCollator.compare(a.label, b.label));
      renderFolderView(
        brandFolders,
        "Manufacturers",
        countLabel(brandFolders.length, "folder")
      );
      return;
    }

    renderDocumentView(documentsForView(state.view));
  };

  const navigateTo = (view, { addToHistory = true } = {}) => {
    if (addToHistory) {
      state.history.push({ ...state.view });
    }

    state.view = { ...view };
    state.visibleLimit = PAGE_SIZE;
    renderView();
    els.view.scrollTop = 0;
  };

  const readFolderTarget = (target) => {
    if (target.matches('[data-archive-folder="root"]')) {
      return { kind: "root" };
    }

    const kind = target.dataset.archiveKind;
    if (!kind) {
      return null;
    }

    return {
      kind,
      ...(target.dataset.archiveId ? { id: target.dataset.archiveId } : {}),
    };
  };

  const normalizeData = (raw) => {
    const assetBaseUrl = raw.config?.assetBaseUrl || "";
    state.manuals = (raw.manuals || [])
      .map((manual) => {
        const collectionId = collectionIdFromUrl(manual.pdfUrl);
        const displayTitle = manual.displayTitle || manual.title || "Untitled document";
        const normalizedManual = {
          ...manual,
          collectionId,
          displayTitle,
          resolvedPdfUrl: resolvePdfUrl(manual, assetBaseUrl),
        };
        normalizedManual.searchText = normalize(
          [
            displayTitle,
            manual.brand,
            manual.model,
            manual.manualCode,
            manual.notes,
            ...(manual.tags || []),
          ].join(" ")
        );
        return normalizedManual;
      })
      .filter((manual) => manual.resolvedPdfUrl);

    state.collections = new Map();
    state.brands = new Map();

    state.manuals.forEach((manual) => {
      if (!collectionMeta.has(manual.collectionId)) {
        manual.collectionId = "other";
      }

      const collection = state.collections.get(manual.collectionId) || [];
      collection.push(manual);
      state.collections.set(manual.collectionId, collection);

      const brandName = (manual.brand || "Unknown").trim() || "Unknown";
      const brand = state.brands.get(brandName) || [];
      brand.push(manual);
      state.brands.set(brandName, brand);
    });

    els.version.textContent = raw.config?.dataVersion
      ? `Index ${raw.config.dataVersion}`
      : "OES Archive";
  };

  const showLoadError = (error) => {
    console.error("Could not load OES Archive Explorer:", error);
    els.filePane.classList.add("is-folder-view");
    els.heading.textContent = "OES Archive";
    els.summary.textContent = "Index unavailable";
    els.view.replaceChildren();

    const message = document.createElement("div");
    message.className = "archive-error";
    message.textContent = "The archive index could not be mounted. Try reopening the app.";
    els.view.append(message);
    els.status.textContent = "Archive index unavailable";
  };

  const initialize = () => {
    if (state.loaded) {
      return Promise.resolve();
    }

    if (state.loadPromise) {
      return state.loadPromise;
    }

    state.loadPromise = fetch(ARCHIVE_JSON_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Archive index returned ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        normalizeData(data);
        state.loaded = true;
        renderTree();
        renderView();
      })
      .catch((error) => {
        state.loadPromise = null;
        showLoadError(error);
      });

    return state.loadPromise;
  };

  explorerWindow.addEventListener("oes:window-open", initialize);

  explorer.addEventListener("click", (event) => {
    const folderTarget = event.target.closest(
      "[data-archive-folder], [data-archive-kind]"
    );
    if (folderTarget) {
      const view = readFolderTarget(folderTarget);
      if (view) {
        navigateTo(view);
      }
      return;
    }

    if (event.target.closest("[data-archive-load-more]")) {
      state.visibleLimit += PAGE_SIZE;
      renderDocumentView(state.visibleDocuments);
    }
  });

  els.back.addEventListener("click", () => {
    const previousView = state.history.pop();
    if (!previousView) {
      return;
    }

    state.view = previousView;
    state.visibleLimit = PAGE_SIZE;
    renderView();
  });

  els.up.addEventListener("click", () => {
    const parent = parentViewFor(state.view);
    if (parent) {
      navigateTo(parent);
    }
  });

  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = els.searchInput.value.trim();
    navigateTo(query ? { kind: "search", query } : { kind: "all" });
  });

  els.clear.addEventListener("click", () => {
    els.searchInput.value = "";
    navigateTo({ kind: "root" });
    els.searchInput.focus();
  });
})();
