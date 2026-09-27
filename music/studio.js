(() => {
  const overlay = document.querySelector('#studio-document-overlay');
  const frame = document.querySelector('#studio-document-frame');
  const title = document.querySelector('#studio-document-title');
  const closeButton = document.querySelector('#studio-document-close');
  const directLink = document.querySelector('#studio-document-direct-link');
  const manualLinks = document.querySelectorAll('.gear-manual-link');

  if (!overlay || !frame || !title || !closeButton || !directLink) {
    return;
  }

  let lastTrigger = null;

  const closeViewer = () => {
    overlay.hidden = true;
    frame.removeAttribute('src');
    document.body.classList.remove('studio-document-open');

    if (lastTrigger) {
      lastTrigger.focus();
    }
  };

  const openViewer = (link) => {
    const pdfUrl = link.href;
    const documentTitle = link.dataset.pdfTitle || link.textContent.trim();

    lastTrigger = link;
    title.textContent = documentTitle;
    frame.src = pdfUrl;
    directLink.href = pdfUrl;
    overlay.hidden = false;
    document.body.classList.add('studio-document-open');
    closeButton.focus();
  };

  manualLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openViewer(link);
    });
  });

  closeButton.addEventListener('click', closeViewer);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeViewer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
      closeViewer();
    }
  });
})();
