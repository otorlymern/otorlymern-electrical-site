const SVG_NS = "http://www.w3.org/2000/svg";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const NODE_SIZE = 90;
const NODE_HALF = NODE_SIZE / 2;
const PORT_OFFSET = 10;

const paletteContainer = document.querySelector("[data-palette]");
const statusEl = document.querySelector("[data-status]");
const canvasWrapper = document.querySelector("[data-canvas-wrapper]");
const canvas = document.getElementById("patch-canvas");
const cableLayer = document.getElementById("cable-layer");
const nodeLayer = document.getElementById("node-layer");
const exportButton = document.querySelector("[data-export]");
const legendOpenButton = document.querySelector("[data-open-legend]");

const nodes = new Map();
const connections = [];
let nodeCounter = 0;
let connectionCounter = 0;
let pendingConnection = null;
let selectedNodeId = null;
let dragState = null;
let manifestData = null;

const PORT_PRESETS = {
  "audio-sources": {
    inputs: [],
    outputs: [{ type: "audio", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
  "cv-sources": {
    inputs: [],
    outputs: [{ type: "cv", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
  "audio-modifiers": {
    inputs: [
      { type: "audio", x: -NODE_HALF - PORT_OFFSET, y: -8 },
      { type: "cv", x: 0, y: -NODE_HALF - PORT_OFFSET },
    ],
    outputs: [{ type: "audio", x: NODE_HALF + PORT_OFFSET, y: -8 }],
  },
  "cv-modifiers": {
    inputs: [
      { type: "cv", x: -NODE_HALF - PORT_OFFSET, y: -16 },
      { type: "cv", x: -NODE_HALF - PORT_OFFSET, y: 16 },
    ],
    outputs: [{ type: "cv", x: NODE_HALF + PORT_OFFSET, y: 0 }],
  },
};

init();

async function init() {
  canvas.setAttribute("viewBox", `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`);
  canvas.setAttribute("width", CANVAS_WIDTH);
  canvas.setAttribute("height", CANVAS_HEIGHT);

  attachCanvasEvents();
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
      // Avoid clobbering typed input if the user adds form fields later.
      const activeTag = document.activeElement?.tagName;
      if (activeTag && ["INPUT", "TEXTAREA"].includes(activeTag)) {
        return;
      }
      removeNode(selectedNodeId);
    }
  });
}

async function loadManifest() {
  setStatus("Loading icons…");
  try {
    const response = await fetch("./icons-manifest.json", { cache: "no-cache" });
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
  paletteContainer.innerHTML = "";

  categories.forEach((category) => {
    const section = document.createElement("section");
    section.className = "palette-group";

    const heading = document.createElement("h3");
    heading.textContent = category.label || category.id;

    const hint = document.createElement("p");
    hint.className = "palette-hint";
    hint.textContent = "Click to add or drag onto the canvas.";

    const grid = document.createElement("div");
    grid.className = "icon-grid";

    category.icons.forEach((icon) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-icon";
      button.dataset.category = category.id;
      button.dataset.icon = icon.path;
      button.dataset.label = icon.file.replace(".svg", "");
      button.draggable = true;

      const img = document.createElement("img");
      img.src = icon.path;
      img.alt = icon.file;
      img.loading = "lazy";
      button.appendChild(img);

      button.addEventListener("click", () => {
        const x = CANVAS_WIDTH / 2 + (Math.random() * 80 - 40);
        const y = CANVAS_HEIGHT / 2 + (Math.random() * 60 - 30);
        addNode(icon.path, category.id, button.dataset.label, x, y);
      });

      button.addEventListener("dragstart", (event) => {
        const payload = JSON.stringify({
          iconPath: icon.path,
          categoryId: category.id,
          label: button.dataset.label,
        });
        event.dataTransfer.setData("application/json", payload);
        event.dataTransfer.effectAllowed = "copy";
      });

      grid.appendChild(button);
    });

    section.append(heading, hint, grid);
    paletteContainer.appendChild(section);
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

function addNode(
  iconPath,
  categoryId,
  label,
  x = CANVAS_WIDTH / 2,
  y = CANVAS_HEIGHT / 2
) {
  const id = `node-${++nodeCounter}`;
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("patch-node");
  group.dataset.nodeId = id;

  const icon = document.createElementNS(SVG_NS, "image");
  icon.setAttributeNS("http://www.w3.org/1999/xlink", "href", iconPath);
  icon.setAttribute("href", iconPath);
  icon.setAttribute("width", NODE_SIZE);
  icon.setAttribute("height", NODE_SIZE);
  icon.setAttribute("x", -NODE_HALF);
  icon.setAttribute("y", -NODE_HALF);
  icon.setAttribute("preserveAspectRatio", "xMidYMid meet");
  group.appendChild(icon);

  const labelEl = document.createElementNS(SVG_NS, "text");
  labelEl.setAttribute("text-anchor", "middle");
  labelEl.setAttribute("y", NODE_HALF + 16);
  labelEl.setAttribute("fill", "#3d1c00");
  labelEl.setAttribute("font-family", "EnterCommand, monospace");
  labelEl.setAttribute("font-size", "12px");
  labelEl.classList.add("node-label");
  labelEl.textContent = label || categoryId;
  group.appendChild(labelEl);

  const ports = buildPortsForNode(group, id, categoryId);

  group.addEventListener("pointerdown", (event) => {
    // Ignore drags that begin on a port; ports manage their own clicks.
    if (event.target.closest(".port")) return;
    event.stopPropagation();
    const current = nodes.get(id);
    dragState = {
      nodeId: id,
      offset: offsetFromPointer(
        event,
        current?.x ?? x,
        current?.y ?? y
      ),
    };
    group.setPointerCapture(event.pointerId);
  });

  group.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.nodeId !== id) return;
    const point = svgPointFromEvent(event);
    const newX = point.x - dragState.offset.x;
    const newY = point.y - dragState.offset.y;
    moveNode(id, newX, newY);
  });

  group.addEventListener("pointerup", (event) => {
    if (dragState?.nodeId === id) {
      dragState = null;
    }
    group.releasePointerCapture(event.pointerId);
  });

  group.addEventListener("click", (event) => {
    if (event.target.closest(".port")) return;
    event.stopPropagation();
    selectNode(id);
  });

  const node = {
    id,
    categoryId,
    iconPath,
    label,
    x,
    y,
    element: group,
    ports,
  };

  nodes.set(id, node);
  nodeLayer.appendChild(group);
  updateNodePosition(node);
  setStatus("Node added. Click an output port, then an input to connect.");
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
    circle.setAttribute("fill", portConfig.type === "cv" ? "#1c6f8b" : "#7b3f00");
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
  pendingConnection = { nodeId, portId: port.id, type: port.type, element: port.element };
  port.element.classList.add("pending");
  setStatus("Output selected. Click a matching input.");
}

function handleInputClick(nodeId, port) {
  if (!pendingConnection) return;
  if (pendingConnection.type !== port.type) {
    setStatus("Type mismatch. Connect audio-to-audio or cv-to-cv.");
    return;
  }

  addConnection(pendingConnection, { nodeId, portId: port.id, type: port.type });
  clearPendingConnection();
}

function addConnection(from, to) {
  const id = `cable-${++connectionCounter}`;
  const line = document.createElementNS(SVG_NS, "line");
  line.classList.add("cable", from.type === "cv" ? "cable-cv" : "cable-audio");
  line.setAttribute("stroke", from.type === "cv" ? "#1c6f8b" : "#7b3f00");
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-linecap", "round");
  if (from.type === "cv") {
    line.setAttribute("stroke-dasharray", "10 6");
  }

  line.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    removeConnection(id);
  });

  const connection = {
    id,
    from,
    to,
    type: from.type,
    element: line,
  };

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

  const fromPort = findPort(fromNode, connection.from.portId);
  const toPort = findPort(toNode, connection.to.portId);
  if (!fromPort || !toPort) return;

  const start = portPosition(fromNode, fromPort);
  const end = portPosition(toNode, toPort);

  connection.element.setAttribute("x1", start.x);
  connection.element.setAttribute("y1", start.y);
  connection.element.setAttribute("x2", end.x);
  connection.element.setAttribute("y2", end.y);
}

function findPort(node, portId) {
  return node.ports.find((port) => port.id === portId);
}

function portPosition(node, port) {
  return {
    x: node.x + port.xOffset,
    y: node.y + port.yOffset,
  };
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
  const node = nodes.get(selectedNodeId);
  node?.element.classList.remove("is-selected");
  selectedNodeId = null;
}

function removeNode(nodeId) {
  const node = nodes.get(nodeId);
  if (!node) return;

  // Remove connections related to this node.
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
  if (pendingConnection?.element) {
    pendingConnection.element.classList.remove("pending");
  }
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

  clone.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
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
      link.href = pngData;
      link.download = "patch.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      resolve();
    };
    image.onerror = reject;
    image.src = url;
  });

  setStatus("Exported patch.png");
}

async function inlineImages(svg) {
  const images = Array.from(svg.querySelectorAll("image"));
  await Promise.all(
    images.map(async (image) => {
      const href =
        image.getAttribute("href") ||
        image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href || href.startsWith("data:")) return;

      const response = await fetch(href);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      image.setAttribute("href", dataUrl);
    })
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function contentBounds() {
  if (!nodes.size && !connections.length) {
    return { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.x - NODE_HALF - PORT_OFFSET);
    minY = Math.min(minY, node.y - NODE_HALF - PORT_OFFSET);
    maxX = Math.max(maxX, node.x + NODE_HALF + PORT_OFFSET);
    maxY = Math.max(maxY, node.y + NODE_HALF + PORT_OFFSET);
  });

  connections.forEach((connection) => {
    const fromNode = nodes.get(connection.from.nodeId);
    const toNode = nodes.get(connection.to.nodeId);
    if (!fromNode || !toNode) return;
    const fromPort = findPort(fromNode, connection.from.portId);
    const toPort = findPort(toNode, connection.to.portId);
    if (!fromPort || !toPort) return;
    const start = portPosition(fromNode, fromPort);
    const end = portPosition(toNode, toPort);
    minX = Math.min(minX, start.x, end.x);
    minY = Math.min(minY, start.y, end.y);
    maxX = Math.max(maxX, start.x, end.x);
    maxY = Math.max(maxY, start.y, end.y);
  });

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
