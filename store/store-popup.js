(function () {
  const STORE_PATH = "/store/";
  const DISMISSED_KEY = "oes-store-popup-dismissed";

  if (window.location.pathname.startsWith(STORE_PATH)) return;
  if (window.sessionStorage.getItem(DISMISSED_KEY) === "1") return;

  const popup = document.createElement("aside");
  popup.className = "oes-store-popup";
  popup.setAttribute("aria-label", "OES store advertisement");
  popup.innerHTML = `
    <button class="oes-store-popup-close" type="button" aria-label="Close store ad">x</button>
    <a class="oes-store-popup-link" href="/store/">
      <img class="oes-store-popup-art" src="/images/store/OESwindowshoppingv2Trans.png" alt="" aria-hidden="true" />
      <span class="oes-store-popup-copy">
        <strong>OES STORE OPEN</strong>
        <span>small runs, bench goods, and free downloads</span>
      </span>
      <span class="oes-store-popup-button">Shop</span>
    </a>
  `;

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, "1");
    popup.classList.add("is-closing");
    window.setTimeout(() => popup.remove(), 180);
  }

  popup.querySelector(".oes-store-popup-close").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.contains(popup)) {
      dismiss();
    }
  });

  window.setTimeout(() => {
    document.body.append(popup);
    window.requestAnimationFrame(() => popup.classList.add("is-visible"));
  }, 900);
})();
