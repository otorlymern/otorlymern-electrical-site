/* Isolated homepage: OES-style pointer reactions and roaming blobs. */
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const hero = document.querySelector('.desktop-brand');
  const resetHero = () => {
    hero.style.removeProperty('--tilt-x');
    hero.style.removeProperty('--tilt-y');
  };
  hero.addEventListener('pointermove', (event) => {
    if (!finePointer.matches) return;
    const tiltScale = reducedMotion.matches ? 0.25 : 1;
    const box = hero.getBoundingClientRect();
    hero.style.setProperty('--tilt-x', `${(0.5 - (event.clientY - box.top) / box.height) * 9 * tiltScale}deg`);
    hero.style.setProperty('--tilt-y', `${((event.clientX - box.left) / box.width - 0.5) * 12 * tiltScale}deg`);
  });
  hero.addEventListener('pointerleave', resetHero);
  document.querySelectorAll('.category-link').forEach((link) => {
    link.addEventListener('pointermove', (event) => {
      if (reducedMotion.matches || !finePointer.matches) return;
      const box = link.getBoundingClientRect();
      link.style.setProperty('--mx', `${event.clientX - box.left}px`);
      link.style.setProperty('--my', `${event.clientY - box.top}px`);
    });
    link.addEventListener('pointerleave', () => {
      link.style.removeProperty('--mx');
      link.style.removeProperty('--my');
    });
  });
  const movers = [...document.querySelectorAll('.blob')].map((element, index) => {
    const box = element.getBoundingClientRect();
    element.style.left = '0';
    element.style.top = '0';
    return { element, x: box.left, y: box.top, vx: .028 + index * .008, vy: .02 + index * .006 };
  });
  let frame = 0;
  let last = 0;
  function tick(now) {
    const elapsed = last ? Math.min(48, now - last) : 0;
    last = now;
    movers.forEach((state) => {
      const maxX = Math.max(0, innerWidth - state.element.offsetWidth);
      const maxY = Math.max(0, innerHeight - state.element.offsetHeight);
      state.x += state.vx * elapsed;
      state.y += state.vy * elapsed;
      if (state.x <= 0 || state.x >= maxX) state.vx *= -1;
      if (state.y <= 0 || state.y >= maxY) state.vy *= -1;
      state.x = Math.max(0, Math.min(maxX, state.x));
      state.y = Math.max(0, Math.min(maxY, state.y));
      state.element.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    });
    frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    cancelAnimationFrame(frame);
    last = 0;
    resetHero();
    if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(tick);
    else movers.forEach(({ element, x, y }) => {
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();
})();
