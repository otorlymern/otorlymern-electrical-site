(() => {
  const body = document.body;
  body.classList.add("rrr-js");

  const hero = document.querySelector(".rrr-hero");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  function setPointerLight(element, event) {
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    element.style.setProperty("--mx", `${x}px`);
    element.style.setProperty("--my", `${y}px`);
  }

  document
    .querySelectorAll(
      ".rrr-panel, .rrr-cta, .system-group-card, .system-card, .rrr-process li",
    )
    .forEach((element) => {
      element.addEventListener("pointermove", (event) => {
        setPointerLight(element, event);
      });
    });

  if (hero && finePointer.matches && !reducedMotion) {
    hero.addEventListener("pointermove", (event) => {
      const rect = hero.getBoundingClientRect();
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;
      hero.style.setProperty("--hero-x", `${xRatio * 100}%`);
      hero.style.setProperty("--hero-y", `${yRatio * 100}%`);
      hero.style.setProperty("--hero-rx", `${(0.5 - yRatio) * 2.4}deg`);
      hero.style.setProperty("--hero-ry", `${(xRatio - 0.5) * 3.2}deg`);
      hero.style.setProperty("--logo-x", `${(xRatio - 0.5) * 16}px`);
      hero.style.setProperty("--logo-y", `${(yRatio - 0.5) * 10}px`);
      hero.style.setProperty("--title-shift-x", `${(xRatio - 0.5) * 24}px`);
      hero.style.setProperty("--title-shift-y", `${(yRatio - 0.5) * 12}px`);
      hero.style.setProperty("--title-slant", `${(xRatio - 0.5) * -22}deg`);
      hero.style.setProperty(
        "--title-stretch",
        `${1 + Math.abs(xRatio - 0.5) * 0.12}`,
      );
      hero.style.setProperty(
        "--title-crush",
        `${1 - Math.abs(yRatio - 0.5) * 0.13}`,
      );
      hero.style.setProperty(
        "--title-twist-x",
        `${(0.5 - yRatio) * 9}deg`,
      );
      hero.style.setProperty(
        "--title-twist-y",
        `${(xRatio - 0.5) * 13}deg`,
      );
      hero.style.setProperty(
        "--title-spacing",
        `${(xRatio - 0.5) * 0.018}em`,
      );
      hero.style.setProperty(
        "--title-brightness",
        `${1.08 + (1 - yRatio) * 0.5}`,
      );
      hero.style.setProperty(
        "--title-contrast",
        `${1.04 + Math.abs(xRatio - 0.5) * 0.38}`,
      );
      hero.classList.add("is-pointer-active");
    });

    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--hero-x", "50%");
      hero.style.setProperty("--hero-y", "50%");
      hero.style.setProperty("--hero-rx", "0deg");
      hero.style.setProperty("--hero-ry", "0deg");
      hero.style.setProperty("--logo-x", "0px");
      hero.style.setProperty("--logo-y", "0px");
      hero.style.setProperty("--title-shift-x", "0px");
      hero.style.setProperty("--title-shift-y", "0px");
      hero.style.setProperty("--title-slant", "0deg");
      hero.style.setProperty("--title-stretch", "1");
      hero.style.setProperty("--title-crush", "1");
      hero.style.setProperty("--title-twist-x", "0deg");
      hero.style.setProperty("--title-twist-y", "0deg");
      hero.style.setProperty("--title-spacing", "0em");
      hero.style.setProperty("--title-brightness", "1");
      hero.style.setProperty("--title-contrast", "1");
      hero.classList.remove("is-pointer-active");
    });
  }

  const revealItems = document.querySelectorAll(".rrr-reveal");
  const processItems = document.querySelectorAll(".rrr-process li");

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    processItems.forEach((item) => item.classList.add("is-powered"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    revealItems.forEach((item) => revealObserver.observe(item));

    const processObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const item = entry.target;
          const index = Array.from(processItems).indexOf(item);
          window.setTimeout(() => {
            item.classList.add("is-powered");
          }, index * 140);
          observer.unobserve(item);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.42 },
    );

    processItems.forEach((item) => processObserver.observe(item));
  }

  if (finePointer.matches && !reducedMotion) {
    document.querySelectorAll(".system-card").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const xRatio = (event.clientX - rect.left) / rect.width;
        const yRatio = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--tilt-x", `${(0.5 - yRatio) * 7}deg`);
        card.style.setProperty("--tilt-y", `${(xRatio - 0.5) * 9}deg`);
      });

      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  const actionButton = document.querySelector(".rrr-action-button");
  if (actionButton) {
    actionButton.addEventListener("pointerdown", () => {
      actionButton.classList.add("is-pressed");
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      actionButton.addEventListener(eventName, () => {
        actionButton.classList.remove("is-pressed");
      });
    });
  }

  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const closeButton = document.getElementById("lightbox-close");
  const previousButton = document.getElementById("lightbox-prev");
  const nextButton = document.getElementById("lightbox-next");
  const galleryImages = Array.from(document.querySelectorAll(".system-thumb"));
  let activeImageIndex = 0;
  let lastFocusedElement = null;

  function renderLightboxImage() {
    const image = galleryImages[activeImageIndex];
    if (!image) return;

    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Expanded restoration image";
    lightboxCaption.textContent = image.alt || "Expanded restoration image";
    lightboxCounter.textContent = `${activeImageIndex + 1} / ${galleryImages.length}`;
  }

  function openLightbox(index) {
    activeImageIndex = index;
    lastFocusedElement = document.activeElement;
    renderLightboxImage();
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    body.classList.add("no-scroll");
    closeButton.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    body.classList.remove("no-scroll");
    lightboxImage.src = "";
    lightboxImage.alt = "";
    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  }

  function showPreviousImage() {
    activeImageIndex =
      (activeImageIndex - 1 + galleryImages.length) % galleryImages.length;
    renderLightboxImage();
  }

  function showNextImage() {
    activeImageIndex = (activeImageIndex + 1) % galleryImages.length;
    renderLightboxImage();
  }

  galleryImages.forEach((image, index) => {
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", `Enlarge ${image.alt}`);
    image.addEventListener("click", () => openLightbox(index));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(index);
      }
    });
  });

  closeButton.addEventListener("click", closeLightbox);
  previousButton.addEventListener("click", showPreviousImage);
  nextButton.addEventListener("click", showNextImage);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("open")) return;

    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowLeft") {
      showPreviousImage();
    } else if (event.key === "ArrowRight") {
      showNextImage();
    } else if (event.key === "Tab") {
      const controls = [closeButton, previousButton, nextButton];
      const currentIndex = controls.indexOf(document.activeElement);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex =
        (currentIndex + direction + controls.length) % controls.length;
      event.preventDefault();
      controls[nextIndex].focus();
    }
  });
})();
