(() => {
  const desktop = document.querySelector("#resources-desktop");
  const appIcons = [...document.querySelectorAll(".desktop-icon")];
  const windows = [...document.querySelectorAll(".resource-window")];
  const taskbarApps = document.querySelector("#taskbar-apps");
  const clock = document.querySelector("#taskbar-clock");
  const loader = document.querySelector("#terminal-loader");

  if (!desktop || !taskbarApps || !clock) {
    return;
  }

  let topZIndex = 10;

  const runBootSequence = () => {
    if (!loader) {
      return;
    }

    const progressBar = loader.querySelector(".terminal-loader__bar");
    const progressText = loader.querySelector(".terminal-loader__percent");
    const bootDuration = 2400;
    const bootStarted = Date.now();

    const updateBootProgress = () => {
      const elapsed = Date.now() - bootStarted;
      const progress = Math.min(100, Math.round((elapsed / bootDuration) * 100));

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }

      if (progressText) {
        progressText.textContent = `${String(progress).padStart(2, "0")}%`;
      }

      if (progress < 100) {
        window.requestAnimationFrame(updateBootProgress);
        return;
      }

      window.setTimeout(() => {
        loader.classList.add("is-complete");
        loader.setAttribute("aria-hidden", "true");
      }, 250);
    };

    window.requestAnimationFrame(updateBootProgress);
  };

  const getWindow = (appName) =>
    windows.find((resourceWindow) => resourceWindow.dataset.window === appName);

  const getTaskbarButton = (appName) =>
    taskbarApps.querySelector(`[data-task-app="${appName}"]`);

  const windowTitle = (resourceWindow) =>
    resourceWindow.querySelector(".window-titlebar h2")?.textContent.trim() || "Resource";

  const setActiveWindow = (resourceWindow) => {
    windows.forEach((candidate) => candidate.classList.remove("is-active"));
    taskbarApps.querySelectorAll(".taskbar-app").forEach((button) => {
      button.classList.remove("is-active");
    });

    if (!resourceWindow || resourceWindow.hidden || resourceWindow.classList.contains("is-minimized")) {
      return;
    }

    topZIndex += 1;
    resourceWindow.style.zIndex = String(topZIndex);
    resourceWindow.classList.add("is-active");
    getTaskbarButton(resourceWindow.dataset.window)?.classList.add("is-active");
  };

  const activateTopVisibleWindow = () => {
    const visibleWindows = windows
      .filter((resourceWindow) => !resourceWindow.hidden && !resourceWindow.classList.contains("is-minimized"))
      .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));

    setActiveWindow(visibleWindows[0]);
  };

  const createTaskbarButton = (resourceWindow) => {
    const appName = resourceWindow.dataset.window;
    let button = getTaskbarButton(appName);

    if (button) {
      return button;
    }

    button = document.createElement("button");
    button.type = "button";
    button.className = "taskbar-app";
    button.dataset.taskApp = appName;
    button.textContent = windowTitle(resourceWindow);
    button.setAttribute("aria-label", `Toggle ${windowTitle(resourceWindow)}`);
    button.addEventListener("click", () => {
      if (resourceWindow.classList.contains("is-minimized")) {
        resourceWindow.classList.remove("is-minimized");
        setActiveWindow(resourceWindow);
        return;
      }

      if (resourceWindow.classList.contains("is-active")) {
        resourceWindow.classList.add("is-minimized");
        resourceWindow.classList.remove("is-active");
        button.classList.remove("is-active");
        activateTopVisibleWindow();
        return;
      }

      setActiveWindow(resourceWindow);
    });

    taskbarApps.append(button);
    return button;
  };

  const openWindow = (appName) => {
    const resourceWindow = getWindow(appName);

    if (!resourceWindow) {
      return;
    }

    resourceWindow.hidden = false;
    resourceWindow.classList.remove("is-minimized");
    createTaskbarButton(resourceWindow);
    setActiveWindow(resourceWindow);
  };

  const minimizeWindow = (resourceWindow) => {
    resourceWindow.classList.add("is-minimized");
    resourceWindow.classList.remove("is-active");
    getTaskbarButton(resourceWindow.dataset.window)?.classList.remove("is-active");
    activateTopVisibleWindow();
  };

  const toggleMaximizeWindow = (resourceWindow) => {
    resourceWindow.classList.toggle("is-maximized");
    setActiveWindow(resourceWindow);
  };

  const closeWindow = (resourceWindow) => {
    resourceWindow.hidden = true;
    resourceWindow.classList.remove("is-active", "is-minimized", "is-maximized");
    resourceWindow.style.removeProperty("left");
    resourceWindow.style.removeProperty("top");
    getTaskbarButton(resourceWindow.dataset.window)?.remove();
    activateTopVisibleWindow();
  };

  const selectIcon = (selectedIcon) => {
    appIcons.forEach((icon) => icon.classList.toggle("is-selected", icon === selectedIcon));
  };

  appIcons.forEach((icon) => {
    icon.addEventListener("click", () => {
      selectIcon(icon);

      if (window.matchMedia("(pointer: coarse)").matches) {
        openWindow(icon.dataset.app);
      }
    });

    icon.addEventListener("dblclick", () => {
      openWindow(icon.dataset.app);
    });

    icon.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openWindow(icon.dataset.app);
      }
    });
  });

  windows.forEach((resourceWindow) => {
    const titlebar = resourceWindow.querySelector(".window-titlebar");

    resourceWindow.addEventListener("pointerdown", () => setActiveWindow(resourceWindow));

    resourceWindow.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = button.dataset.action;

        if (action === "minimize") {
          minimizeWindow(resourceWindow);
        } else if (action === "maximize") {
          toggleMaximizeWindow(resourceWindow);
        } else if (action === "close") {
          closeWindow(resourceWindow);
        }
      });
    });

    titlebar?.addEventListener("dblclick", (event) => {
      if (!event.target.closest(".window-controls")) {
        toggleMaximizeWindow(resourceWindow);
      }
    });

    titlebar?.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        event.target.closest(".window-controls") ||
        resourceWindow.classList.contains("is-maximized") ||
        window.matchMedia("(max-width: 700px)").matches
      ) {
        return;
      }

      event.preventDefault();
      setActiveWindow(resourceWindow);

      const desktopRect = desktop.getBoundingClientRect();
      const windowRect = resourceWindow.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = windowRect.left - desktopRect.left;
      const startTop = windowRect.top - desktopRect.top;
      const taskbarHeight = desktop.querySelector(".desktop-taskbar")?.offsetHeight || 0;

      titlebar.setPointerCapture(event.pointerId);

      const moveWindow = (moveEvent) => {
        const maxLeft = desktop.clientWidth - resourceWindow.offsetWidth;
        const maxTop = desktop.clientHeight - taskbarHeight - titlebar.offsetHeight;
        const nextLeft = Math.min(Math.max(0, startLeft + moveEvent.clientX - startX), maxLeft);
        const nextTop = Math.min(Math.max(0, startTop + moveEvent.clientY - startY), maxTop);

        resourceWindow.style.left = `${nextLeft}px`;
        resourceWindow.style.top = `${nextTop}px`;
      };

      const stopDragging = () => {
        titlebar.removeEventListener("pointermove", moveWindow);
        titlebar.removeEventListener("pointerup", stopDragging);
        titlebar.removeEventListener("pointercancel", stopDragging);
      };

      titlebar.addEventListener("pointermove", moveWindow);
      titlebar.addEventListener("pointerup", stopDragging);
      titlebar.addEventListener("pointercancel", stopDragging);
    });
  });

  const updateClock = () => {
    clock.textContent = new Intl.DateTimeFormat([], {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date());
  };

  updateClock();
  window.setInterval(updateClock, 30000);
  runBootSequence();
})();
