const CASH_SYMBOLS = [
  "/images/store/cashcircleassetsolo.png",
  "/images/store/cash3dcircleassetsolo.png",
];

const products = [
  {
    id: "oes-window-shopper-tee",
    name: "Window Shopper Tee",
    cashSymbol: CASH_SYMBOLS[0],
    description: "A shirt for standing in front of obsolete gear and deciding it is actually treasure.",
    priceLabel: "Price TBA",
    status: "coming-soon",
    category: "wearables",
    stripeCheckoutUrl: "",
    variants: [
      { label: "Small", stripeCheckoutUrl: "" },
      { label: "Medium", stripeCheckoutUrl: "" },
      { label: "Large", stripeCheckoutUrl: "" },
      { label: "XL", stripeCheckoutUrl: "" },
    ],
  },
  {
    id: "oes-service-sticker-sheet",
    name: "OES Service Sticker Sheet",
    cashSymbol: CASH_SYMBOLS[1],
    description: "Glossy OES labels for racks, road cases, notebooks, and suspicious appliances.",
    priceLabel: "Price TBA",
    status: "coming-soon",
    category: "stickers",
    stripeCheckoutUrl: "",
    variants: [
      { label: "3 pack", stripeCheckoutUrl: "" },
      { label: "10 pack", stripeCheckoutUrl: "" },
    ],
  },
  {
    id: "bench-notes-zine",
    name: "Bench Notes Zine",
    cashSymbol: CASH_SYMBOLS[0],
    description: "Printed notes, diagrams, repair scraps, and OES studio marginalia collected into a small booklet.",
    priceLabel: "Price TBA",
    status: "coming-soon",
    category: "paper",
    stripeCheckoutUrl: "",
    variants: [
      { label: "First edition", stripeCheckoutUrl: "" },
    ],
  },
  {
    id: "blank-patch-card-pdf",
    name: "Blank Patch Card PDF",
    cashSymbol: CASH_SYMBOLS[1],
    description: "Printable patch notes for synths, tape paths, mixer recalls, and repair-bench mysteries.",
    priceLabel: "FREE",
    status: "free-download",
    category: "downloads",
    downloadUrl: "",
  },
  {
    id: "studio-sample-scraps",
    name: "Studio Sample Scraps",
    cashSymbol: CASH_SYMBOLS[0],
    description: "Short loops, tones, room junk, and useful little noises from the OES bench.",
    priceLabel: "FREE",
    status: "free-download",
    category: "audio",
    downloadUrl: "",
  },
  {
    id: "mystery-bench-object",
    name: "Mystery Bench Object",
    cashSymbol: CASH_SYMBOLS[1],
    description: "A tiny rotating shelf for cable charms, tape labels, odd panels, and other studio-adjacent bits.",
    priceLabel: "Price TBA",
    status: "coming-soon",
    category: "audio",
    stripeCheckoutUrl: "",
    variants: [
      { label: "Desk drawer pick", stripeCheckoutUrl: "" },
    ],
  },
];

const desktop = document.querySelector("#store-desktop");
const productGrid = document.querySelector("#product-grid");
const taskbarWindows = document.querySelector("#taskbar-windows");
const taskbarStatus = document.querySelector("#taskbar-status");
const clock = document.querySelector("#desktop-clock");
const windows = [...document.querySelectorAll(".store-window")];
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const mediaCanDrag = window.matchMedia("(min-width: 821px) and (pointer: fine)");

let activeFilter = "all";
let topZ = 20;
let dragState = null;

function checkoutUrlFor(product, variantIndex = 0) {
  const variant = product.variants?.[variantIndex];
  return variant?.stripeCheckoutUrl || product.stripeCheckoutUrl || "";
}

function downloadUrlFor(product) {
  return product.downloadUrl || "";
}

function actionState(product, variantIndex = 0) {
  if (product.status === "sold-out") {
    return { disabled: true, kind: "none", label: "Sold out", status: "Sold out" };
  }

  if (product.status === "free-download") {
    const url = downloadUrlFor(product);
    return {
      disabled: !url,
      kind: "download",
      label: url ? "Download free" : "Download soon",
      status: "Free download",
      url,
    };
  }

  const url = checkoutUrlFor(product, variantIndex);
  if (url) {
    return { disabled: false, kind: "checkout", label: "Buy with Stripe", status: "Ready", url };
  }

  return { disabled: true, kind: "checkout", label: "Coming soon", status: "Coming soon" };
}

function setStatus(message) {
  if (taskbarStatus) {
    taskbarStatus.textContent = message;
  }
}

function renderProducts() {
  const visibleProducts = products.filter((product) => activeFilter === "all" || product.category === activeFilter);

  productGrid.innerHTML = visibleProducts
    .map((product) => {
      const variants = product.variants || [];
      const hasMultipleVariants = variants.length > 1;
      const initialAction = actionState(product);

      return `
        <article class="product-card" data-product-id="${product.id}">
          <div class="product-title-line">
            <h3>${product.name}</h3>
            <img class="product-cash-symbol" src="${product.cashSymbol}" alt="" aria-hidden="true" loading="lazy" />
            <span class="product-price">${product.priceLabel}</span>
          </div>
          <div class="product-copy">
            <p class="product-description">${product.description}</p>
            <div class="product-meta">
              <span class="product-category">${product.category}</span>
              <span class="product-status" data-product-status data-product-state="${product.status}">${initialAction.status}</span>
            </div>
            ${
              variants.length
                ? `<div class="product-variant">
                    <label for="${product.id}-variant">Variant</label>
                    <select id="${product.id}-variant" data-product-variant ${hasMultipleVariants ? "" : "disabled"}>
                      ${variants.map((variant, index) => `<option value="${index}">${variant.label}</option>`).join("")}
                    </select>
                  </div>`
                : ""
            }
            <button class="product-buy" type="button" data-buy-product="${product.id}" ${initialAction.disabled ? "disabled" : ""}>
              ${initialAction.label}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  if (!visibleProducts.length) {
    productGrid.innerHTML = `<p>No store objects in this drawer yet.</p>`;
  }
}

function updateProductCard(card) {
  const product = products.find((candidate) => candidate.id === card.dataset.productId);
  if (!product) return;

  const variantSelect = card.querySelector("[data-product-variant]");
  const variantIndex = Number(variantSelect?.value || 0);
  const buyButton = card.querySelector("[data-buy-product]");
  const statusNode = card.querySelector("[data-product-status]");
  const action = actionState(product, variantIndex);

  statusNode.textContent = action.status;
  buyButton.disabled = action.disabled;
  buyButton.textContent = action.label;
}

function focusWindow(targetWindow) {
  windows.forEach((candidate) => candidate.classList.remove("is-active"));
  targetWindow.classList.add("is-active", "is-open");
  topZ += 1;
  targetWindow.style.zIndex = String(topZ);

  [...taskbarWindows.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("is-active", button.dataset.openWindow === targetWindow.id);
    button.setAttribute("aria-pressed", button.dataset.openWindow === targetWindow.id ? "true" : "false");
  });
}

function openWindow(windowId) {
  const targetWindow = document.getElementById(windowId);
  if (!targetWindow) return;
  focusWindow(targetWindow);
  setStatus(`${targetWindow.dataset.windowTitle} active`);
}

function minimizeWindow(targetWindow) {
  targetWindow.classList.remove("is-open", "is-active");
  setStatus(`${targetWindow.dataset.windowTitle} minimized`);
  const nextOpenWindow = windows.find((candidate) => candidate.classList.contains("is-open"));
  if (nextOpenWindow) focusWindow(nextOpenWindow);
}

function buildTaskbar() {
  taskbarWindows.innerHTML = windows
    .map((targetWindow) => {
      const title = targetWindow.dataset.windowTitle || "Window";
      return `<button type="button" data-open-window="${targetWindow.id}" aria-pressed="false">${title}</button>`;
    })
    .join("");
}

function constrainWindowPosition(targetWindow, nextLeft, nextTop) {
  const workspace = document.querySelector(".desktop-workspace");
  const workspaceRect = workspace.getBoundingClientRect();
  const windowRect = targetWindow.getBoundingClientRect();
  const maxLeft = Math.max(0, workspaceRect.width - windowRect.width - 8);
  const maxTop = Math.max(0, workspaceRect.height - windowRect.height - 8);

  return {
    left: Math.min(Math.max(8, nextLeft), maxLeft),
    top: Math.min(Math.max(8, nextTop), maxTop),
  };
}

function startDrag(event, targetWindow) {
  if (!mediaCanDrag.matches || event.button !== 0 || event.target.closest(".window-controls")) return;

  const workspace = document.querySelector(".desktop-workspace");
  const workspaceRect = workspace.getBoundingClientRect();
  const rect = targetWindow.getBoundingClientRect();

  focusWindow(targetWindow);
  dragState = {
    targetWindow,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left - workspaceRect.left,
    startTop: rect.top - workspaceRect.top,
  };

  targetWindow.style.left = `${dragState.startLeft}px`;
  targetWindow.style.top = `${dragState.startTop}px`;
  targetWindow.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const nextLeft = dragState.startLeft + event.clientX - dragState.startX;
  const nextTop = dragState.startTop + event.clientY - dragState.startY;
  const constrained = constrainWindowPosition(dragState.targetWindow, nextLeft, nextTop);

  dragState.targetWindow.style.left = `${constrained.left}px`;
  dragState.targetWindow.style.top = `${constrained.top}px`;
}

function endDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  dragState.targetWindow.releasePointerCapture(event.pointerId);
  dragState = null;
}

function updateClock() {
  const now = new Date();
  const timeText = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  clock.textContent = timeText;
  clock.dateTime = now.toISOString();
}

function wireEvents() {
  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-window]");
    if (openButton) {
      event.preventDefault();
      openWindow(openButton.dataset.openWindow);
      return;
    }

    const closeButton = event.target.closest("[data-close-window]");
    if (closeButton) {
      const targetWindow = closeButton.closest(".store-window");
      minimizeWindow(targetWindow);
      return;
    }

    const minimizeButton = event.target.closest("[data-minimize-window]");
    if (minimizeButton) {
      const targetWindow = minimizeButton.closest(".store-window");
      minimizeWindow(targetWindow);
      return;
    }

    const buyButton = event.target.closest("[data-buy-product]");
    if (buyButton) {
      const product = products.find((candidate) => candidate.id === buyButton.dataset.buyProduct);
      const card = buyButton.closest(".product-card");
      const variantIndex = Number(card.querySelector("[data-product-variant]")?.value || 0);
      const action = actionState(product, variantIndex);

      if (!action.url) {
        setStatus(action.kind === "download" ? "Download file pending for this item" : "Stripe link missing for this item");
        return;
      }

      window.open(action.url, "_blank", "noopener,noreferrer");
      setStatus(action.kind === "download" ? `Opening free download for ${product.name}` : `Opening Stripe checkout for ${product.name}`);
    }
  });

  document.addEventListener("change", (event) => {
    const variantSelect = event.target.closest("[data-product-variant]");
    if (!variantSelect) return;
    updateProductCard(variantSelect.closest(".product-card"));
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((candidate) => candidate.classList.toggle("is-selected", candidate === button));
      renderProducts();
      setStatus(activeFilter === "all" ? "Showing all store objects" : `Showing ${activeFilter}`);
    });
  });

  windows.forEach((targetWindow) => {
    targetWindow.addEventListener("pointerdown", () => focusWindow(targetWindow));
    targetWindow.querySelector("[data-drag-handle]")?.addEventListener("pointerdown", (event) => {
      startDrag(event, targetWindow);
    });
    targetWindow.addEventListener("pointermove", moveDrag);
    targetWindow.addEventListener("pointerup", endDrag);
    targetWindow.addEventListener("pointercancel", endDrag);
  });
}

buildTaskbar();
renderProducts();
wireEvents();
updateClock();
window.setInterval(updateClock, 30_000);
focusWindow(document.querySelector("#catalog-window"));
