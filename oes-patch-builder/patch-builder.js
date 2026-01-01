const SVG_NS = "http://www.w3.org/2000/svg";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const NODE_SIZE = 90;
const NODE_HALF = NODE_SIZE / 2;
const PORT_OFFSET = 10;

const workspace = document.querySelector("[data-workspace]");
const statusEl = document.querySelector("[data-status]");
const canvasWrapper = document.querySelector("[data-canvas-wrapper]");
const canvas = document.getElementById("patch-canvas");
const cableLayer = document.getElementById("cable-layer");
const nodeLayer = document.getElementById("node-layer");
const exportButton = document.querySelector("[data-export]");

// Palette containers are now per-category windows.
const paletteContainers = new Map(
  Array.from(document.querySelectorAll("[data-palette]")).map((el) => [
    el.getAttribute("data-palette"),
    el,
  ])
);

const nodes = new Map();
const connections = [];
let nodeCounter = 0;
let connectionCounter = 0;
let pendingConnection = null;
let selectedNodeId = null;
let dragState = null;
let manifestData = null;

// Window dragging
let windowDrag = null;
let topZ = 10;

const CATEGORY_ORDER = [
  "audio-sources",
  "audio-modifiers",
  "cv-sources",
  "cv-modifiers",
];

const PORT_PRESETS = {
  "audio-sources": {
    inputs: [
      { type: "cv", x: 0, y: -NODE_HALF - PORT_OFFSET },
      { type: "audio", x: 0, y: NODE_HALF + PORT_OFFSET },
    ],
    outputs: [{ type: "audio", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
  "cv-sources": {
    inputs: [
      { type: "cv", x: 0, y: -NODE_HALF - PORT_OFFSET },
      { type: "audio", x: 0, y: NODE_HALF + PORT_OFFSET },
    ],
    outputs: [{ type: "cv", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
  "audio-modifiers": {
    inputs: [
      { type: "audio", x: -NODE_HALF - PORT_OFFSET, y: -10 },
      { type: "cv", x: -NODE_HALF - PORT_OFFSET, y: 10 },
      { type: "cv", x: 0, y: -NODE_HALF - PORT_OFFSET },
    ],
    outputs: [{ type: "audio", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
  "cv-modifiers": {
    inputs: [
      { type: "cv", x: -NODE_HALF - PORT_OFFSET, y: -12 },
      { type: "cv", x: -NODE_HALF - PORT_OFFSET, y: 12 },
      { type: "cv", x: 0, y: -NODE_HALF - PORT_OFFSET },
    ],
    outputs: [{ type: "cv", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
};

init();

async function init() {
  if (!canvas || !workspace) return;

  canvas.setAttribute("viewBox", `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`);
  canvas.removeAttribute("width");
  canvas.removeAttribute("height");

  attachCanvasEvents();
  initWindowLayout();

  await loadManifest();

  exportButton?.addEventListener("click", () => {
    exportPatchAsPng().catch((err) => {
      console.error(err);
      setStatus("Export failed. Check console for details.");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!selectedNodeId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      const activeTag = document.activeElement?.tagName;
      if (activeTag && ["INPUT", "TEXTAREA"].includes(activeTag)) return;
      removeNode(selectedNodeId);
    }
  });
}

function attachWindowEvents() {
  const windows = Array.from(document.querySelectorAll(".w98-window"));

  // close buttons do nothing (per request), but stop drag initiation.
  windows.forEach((win) => {
    win.querySelector(".w98-close")?.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  });

  // drag by titlebar
  windows.forEach((win) => {
    const handle = win.querySelector("[data-drag-handle]");
    if (!handle) return;

    handle.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.(".w98-close")) return;
      event.preventDefault();

      const rect = win.getBoundingClientRect();
      const wsRect = workspace.getBoundingClientRect();

      windowDrag = {
        pointerId: event.pointerId,
        win,
        wsRect,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left - wsRect.left,
        top: rect.top - wsRect.top,
      };

      topZ += 1;
      win.style.zIndex = String(topZ);

      handle.setPointerCapture(event.pointerId);
      handle.style.cursor = "grabbing";
    });

    handle.addEventListener("pointermove", (event) => {
      if (!windowDrag || windowDrag.pointerId !== event.pointerId) return;
      const { win, wsRect } = windowDrag;

      const dx = event.clientX - windowDrag.startX;
      const dy = event.clientY - windowDrag.startY;

      const nextLeft = windowDrag.left + dx;
      const nextTop = windowDrag.top + dy;

      const maxLeft = Math.max(0, wsRect.width - win.offsetWidth);
      const maxTop = Math.max(0, wsRect.height - win.offsetHeight);

      win.style.left = `${clamp(nextLeft, 0, maxLeft)}px`;
      win.style.top = `${clamp(nextTop, 0, maxTop)}px`;
    });

    handle.addEventListener("pointerup", (event) => {
      if (!windowDrag || windowDrag.pointerId !== event.pointerId) return;
      handle.releasePointerCapture(event.pointerId);
      handle.style.cursor = "grab";

      const moved = windowDrag.win;
      windowDrag = null;

      // Keep palette windows "connected" by at least one edge.
      if (moved?.dataset?.dockGroup === "palette") {
        ensurePaletteConnectivity(moved);
      } else if (moved?.dataset?.dockGroup === "canvas") {
        // optional: keep canvas away from edges slightly
      }
    });
  });
}

function initWindowLayout() {
  // Grid layout now controls positioning; no-op.
  return;
}

function clampWindowToWorkspace(win) {
  if (!win) return;
  const wsRect = workspace.getBoundingClientRect();
  const left = parseFloat(win.style.left || "0");
  const top = parseFloat(win.style.top || "0");
  const maxLeft = Math.max(0, wsRect.width - win.offsetWidth);
  const maxTop = Math.max(0, wsRect.height - win.offsetHeight);
  win.style.left = `${clamp(left, 0, maxLeft)}px`;
  win.style.top = `${clamp(top, 0, maxTop)}px`;
}

function ensurePaletteConnectivity(movedWin) {
  const paletteWins = Array.from(
    document.querySelectorAll('.w98-window[data-dock-group="palette"]')
  );

  const moved = rectInWorkspace(movedWin);
  const others = paletteWins.filter((w) => w !== movedWin);
  if (!others.length) return;

  const wsRect = workspace.getBoundingClientRect();
  const maxLeft = Math.max(0, wsRect.width - movedWin.offsetWidth);
  const maxTop = Math.max(0, wsRect.height - movedWin.offsetHeight);

  movedWin.style.left = `${clamp(best.left, 0, maxLeft)}px`;
  movedWin.style.top = `${clamp(best.top, 0, maxTop)}px`;
}

function rectInWorkspace(el) {
  const wsRect = workspace.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    left: r.left - wsRect.left,
    top: r.top - wsRect.top,
    right: r.right - wsRect.left,
    bottom: r.bottom - wsRect.top,
    width: r.width,
    height: r.height,
  };
}

function rectsTouch(a, b) {
  const eps = 3; // pixels
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 12;
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 12;

  const touchLeft = Math.abs(a.left - b.right) <= eps && overlapY;
  const touchRight = Math.abs(a.right - b.left) <= eps && overlapY;
  const touchTop = Math.abs(a.top - b.bottom) <= eps && overlapX;
  const touchBottom = Math.abs(a.bottom - b.top) <= eps && overlapX;

  return touchLeft || touchRight || touchTop || touchBottom;
}

function bestSnap(moved, target) {
  // Find smallest translation that makes moved touch target by an edge,
  // keeping the moved window's current size.
  const candidates = [];

  // Snap moved's left to target's right
  candidates.push({
    left: target.right,
    top: clamp(moved.top, target.top - moved.height + 24, target.bottom - 24),
    dist: Math.abs(moved.left - target.right),
  });

  // Snap moved's right to target's left
  candidates.push({
    left: target.left - moved.width,
    top: clamp(moved.top, target.top - moved.height + 24, target.bottom - 24),
    dist: Math.abs(moved.right - target.left),
  });

  // Snap moved's top to target's bottom
  candidates.push({
    left: clamp(moved.left, target.left - moved.width + 24, target.right - 24),
    top: target.bottom,
    dist: Math.abs(moved.top - target.bottom),
  });

  // Snap moved's bottom to target's top
  candidates.push({
    left: clamp(moved.left, target.left - moved.width + 24, target.right - 24),
    top: target.top - moved.height,
    dist: Math.abs(moved.bottom - target.top),
  });

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0];
}

async function loadManifest() {
  setStatus("Loading icons…");
  try {
    const response = await fetch("./icons-manifest.json", {
      cache: "no-cache",
    });
    if (!response.ok) throw new Error("Failed to fetch manifest");
    manifestData = await response.json();
    renderPalette(manifestData.categories || []);
    setStatus("Click or drag an icon into the canvas.");
  } catch (error) {
    console.error("Could not load icons manifest:", error);
    setStatus("Could not load icons. Ensure icons-manifest.json exists.");
  }
}

function renderPalette(categories) {
  // Clear all category containers
  paletteContainers.forEach((container) => (container.innerHTML = ""));

  const byId = new Map(categories.map((c) => [c.id, c]));
  CATEGORY_ORDER.forEach((categoryId) => {
    const category = byId.get(categoryId);
    const grid = paletteContainers.get(categoryId);
    if (!category || !grid) return;

    category.icons.forEach((icon) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-icon";
      button.dataset.category = categoryId;
      button.dataset.icon = icon.path;
      button.dataset.label = icon.file.replace(".svg", "");
      button.draggable = true;

      const img = document.createElement("img");
      img.src = icon.path;
      img.alt = icon.file;
      img.loading = "lazy";
      button.appendChild(img);

      const name = document.createElement("span");
      name.className = "icon-name";
      name.textContent = icon.file;
      button.appendChild(name);

      button.addEventListener("click", () => {
        const x = CANVAS_WIDTH / 2 + (Math.random() * 80 - 40);
        const y = CANVAS_HEIGHT / 2 + (Math.random() * 60 - 30);
        addNode(icon.path, categoryId, button.dataset.label, x, y);
      });

      button.addEventListener("dragstart", (event) => {
        const payload = JSON.stringify({
          iconPath: icon.path,
          categoryId,
          label: button.dataset.label,
        });
        event.dataTransfer.setData("application/json", payload);
        event.dataTransfer.effectAllowed = "copy";
      });

      grid.appendChild(button);
    });
  });
}

function attachCanvasEvents() {
  canvasWrapper?.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  canvasWrapper?.addEventListener("drop", (event) => {
    event.preventDefault();
    const payload =
      event.dataTransfer.getData("application/json") ||
      event.dataTransfer.getData("text/plain");
    if (!payload) return;

    try {
      const data = JSON.parse(payload);
      const point = svgPointFromEvent(event);
      addNode(data.iconPath, data.categoryId, data.label, point.x, point.y);
    } catch (error) {
      console.error("Invalid drag data", error);
    }
  });

  // Only clear state when the user clicks the background, not ports/nodes/cables.
  canvas.addEventListener("pointerdown", (event) => {
    if (
      event.target?.closest?.(".port") ||
      event.target?.closest?.(".patch-node") ||
      event.target?.closest?.(".cable")
    ) {
      return;
    }
    clearPendingConnection();
    clearSelectedNode();
  });
}

function addNode(iconPath, categoryId, label, x, y) {
  const id = `node-${++nodeCounter}`;
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("patch-node");
  group.dataset.nodeId = id;
  group.dataset.category = categoryId;

  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", iconPath);
  image.setAttribute("x", -NODE_HALF);
  image.setAttribute("y", -NODE_HALF);
  image.setAttribute("width", NODE_SIZE);
  image.setAttribute("height", NODE_SIZE);
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  group.appendChild(image);

  const labelEl = document.createElementNS(SVG_NS, "text");
  labelEl.setAttribute("text-anchor", "middle");
  labelEl.setAttribute("x", "0");
  labelEl.setAttribute("y", NODE_HALF + 16);
  labelEl.setAttribute("fill", "#3d1c00");
  labelEl.setAttribute("font-family", "ms-w98-ui-main, Arial, sans-serif");
  labelEl.setAttribute("font-size", "12px");
  labelEl.classList.add("node-label");
  labelEl.textContent = label || categoryId;
  group.appendChild(labelEl);

  const ports = buildPortsForNode(group, id, categoryId);

  group.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".port")) return;
    event.stopPropagation();
    const current = nodes.get(id);
    dragState = {
      nodeId: id,
      offset: offsetFromPointer(event, current?.x ?? x, current?.y ?? y),
    };
    group.setPointerCapture(event.pointerId);
  });

  group.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.nodeId !== id) return;
    const point = svgPointFromEvent(event);
    moveNode(id, point.x - dragState.offset.x, point.y - dragState.offset.y);
  });

  group.addEventListener("pointerup", (event) => {
    if (dragState?.nodeId === id) dragState = null;
    group.releasePointerCapture(event.pointerId);
  });

  group.addEventListener("click", (event) => {
    if (event.target.closest(".port")) return;
    event.stopPropagation();
    selectNode(id);
  });

  nodes.set(id, {
    id,
    categoryId,
    iconPath,
    label,
    x,
    y,
    element: group,
    ports,
  });
  nodeLayer.appendChild(group);
  updateNodePosition(nodes.get(id));
}

function buildPortsForNode(group, nodeId, categoryId) {
  const preset = PORT_PRESETS[categoryId] || PORT_PRESETS["audio-sources"];
  const ports = [];

  const addPort = (portConfig, role, index) => {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.classList.add("port", `port-${portConfig.type}`, `port-${role}`);
    circle.setAttribute("r", "6");
    circle.setAttribute("cx", portConfig.x);
    circle.setAttribute("cy", portConfig.y);
    circle.setAttribute(
      "fill",
      portConfig.type === "cv" ? "#008080" : "#d8c8ff"
    );
    circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "1.5");

    const portId = `${nodeId}-${role}-${index}`;
    const port = {
      id: portId,
      type: portConfig.type,
      role,
      xOffset: portConfig.x,
      yOffset: portConfig.y,
      element: circle,
    };

    if (role === "output") {
      circle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        handleOutputClick(nodeId, port);
      });
    } else {
      circle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        handleInputClick(nodeId, port);
      });
    }

    group.appendChild(circle);
    ports.push(port);
  };

  preset.inputs.forEach((config, index) => addPort(config, "input", index));
  preset.outputs.forEach((config, index) => addPort(config, "output", index));
  return ports;
}

function moveNode(nodeId, x, y) {
  const node = nodes.get(nodeId);
  if (!node) return;
  node.x = x;
  node.y = y;
  updateNodePosition(node);
  updateConnectionsForNode(nodeId);
}

function updateNodePosition(node) {
  node.element.setAttribute("transform", `translate(${node.x}, ${node.y})`);
}

function handleOutputClick(nodeId, port) {
  clearPendingConnection();
  pendingConnection = {
    nodeId,
    portId: port.id,
    type: port.type,
    element: port.element,
  };
  port.element.classList.add("pending");
  setStatus("Output selected. Click a matching input.");
}

function handleInputClick(nodeId, port) {
  if (!pendingConnection) return;
  if (pendingConnection.type !== port.type) {
    setStatus("Type mismatch. Connect audio-to-audio or cv-to-cv.");
    return;
  }
  addConnection(pendingConnection, {
    nodeId,
    portId: port.id,
    type: port.type,
  });
  clearPendingConnection();
}

function addConnection(from, to) {
  const id = `cable-${++connectionCounter}`;
  const line = document.createElementNS(SVG_NS, "line");
  line.classList.add("cable", from.type === "cv" ? "cable-cv" : "cable-audio");
  line.setAttribute("stroke", from.type === "cv" ? "#1c6f8b" : "#7b3f00");
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-linecap", "round");
  if (from.type === "cv") line.setAttribute("stroke-dasharray", "10 6");

  line.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    removeConnection(id);
  });

  const connection = { id, from, to, type: from.type, element: line };
  connections.push(connection);
  cableLayer.appendChild(line);
  updateCablePosition(connection);
  setStatus("Cable added. Click a cable to delete it.");
}

function removeConnection(id) {
  const index = connections.findIndex((conn) => conn.id === id);
  if (index === -1) return;
  const [connection] = connections.splice(index, 1);
  connection.element.remove();
  setStatus("Cable removed.");
}

function updateConnectionsForNode(nodeId) {
  connections
    .filter((conn) => conn.from.nodeId === nodeId || conn.to.nodeId === nodeId)
    .forEach(updateCablePosition);
}

function updateCablePosition(connection) {
  const fromNode = nodes.get(connection.from.nodeId);
  const toNode = nodes.get(connection.to.nodeId);
  if (!fromNode || !toNode) return;

  const fromPort = fromNode.ports.find((p) => p.id === connection.from.portId);
  const toPort = toNode.ports.find((p) => p.id === connection.to.portId);
  if (!fromPort || !toPort) return;

  const start = {
    x: fromNode.x + fromPort.xOffset,
    y: fromNode.y + fromPort.yOffset,
  };
  const end = { x: toNode.x + toPort.xOffset, y: toNode.y + toPort.yOffset };

  connection.element.setAttribute("x1", start.x);
  connection.element.setAttribute("y1", start.y);
  connection.element.setAttribute("x2", end.x);
  connection.element.setAttribute("y2", end.y);
}

function selectNode(nodeId) {
  if (selectedNodeId === nodeId) return;
  clearSelectedNode();
  selectedNodeId = nodeId;
  const node = nodes.get(nodeId);
  if (node) {
    node.element.classList.add("is-selected");
    setStatus("Node selected. Press Delete/Backspace to remove.");
  }
}

function clearSelectedNode() {
  if (!selectedNodeId) return;
  nodes.get(selectedNodeId)?.element.classList.remove("is-selected");
  selectedNodeId = null;
}

function removeNode(nodeId) {
  const node = nodes.get(nodeId);
  if (!node) return;

  [...connections].forEach((connection) => {
    if (connection.from.nodeId === nodeId || connection.to.nodeId === nodeId) {
      removeConnection(connection.id);
    }
  });

  node.element.remove();
  nodes.delete(nodeId);
  if (selectedNodeId === nodeId) selectedNodeId = null;
  setStatus("Node removed.");
}

function clearPendingConnection() {
  pendingConnection?.element?.classList.remove("pending");
  pendingConnection = null;
}

function offsetFromPointer(event, x, y) {
  const point = svgPointFromEvent(event);
  return { x: point.x - x, y: point.y - y };
}

function svgPointFromEvent(event) {
  const point = canvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const screenCTM = canvas.getScreenCTM();
  return screenCTM ? point.matrixTransform(screenCTM.inverse()) : point;
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

async function exportPatchAsPng() {
  if (!canvas) return;
  setStatus("Preparing export…");

  const clone = canvas.cloneNode(true);
  await inlineImages(clone);

  const bounds = contentBounds();
  const padding = 28;
  const viewBox = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: Math.max(bounds.width + padding * 2, 240),
    height: Math.max(bounds.height + padding * 2, 240),
  };

  clone.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
  );
  clone.setAttribute("width", viewBox.width);
  clone.setAttribute("height", viewBox.height);

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", viewBox.x);
  background.setAttribute("y", viewBox.y);
  background.setAttribute("width", viewBox.width);
  background.setAttribute("height", viewBox.height);
  background.setAttribute("fill", "#ffffff");
  clone.insertBefore(background, clone.firstChild);

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = viewBox.width;
      exportCanvas.height = viewBox.height;
      const ctx = exportCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const pngData = exportCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "oes-patch-notation.png";
      link.href = pngData;
      link.click();
      resolve();
    };
    image.onerror = reject;
    image.src = url;
  });

  setStatus("patch downloaded.");
}

async function inlineImages(svgElement) {
  const images = Array.from(svgElement.querySelectorAll("image"));
  await Promise.all(
    images.map(async (img) => {
      const href =
        img.getAttribute("href") ||
        img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href || href.startsWith("data:")) return;
      const dataUrl = await fetchAsDataUrl(href);
      if (dataUrl) img.setAttribute("href", dataUrl);
    })
  );
}

async function fetchAsDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function contentBounds() {
  // bounds based on nodes
  const nodeList = Array.from(nodes.values());
  if (!nodeList.length) return { x: 0, y: 0, width: 400, height: 400 };

  const xs = nodeList.map((n) => n.x);
  const ys = nodeList.map((n) => n.y);

  const minX = Math.min(...xs) - NODE_HALF - 40;
  const maxX = Math.max(...xs) + NODE_HALF + 40;
  const minY = Math.min(...ys) - NODE_HALF - 40;
  const maxY = Math.max(...ys) + NODE_HALF + 80;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
