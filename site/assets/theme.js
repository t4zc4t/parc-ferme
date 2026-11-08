// light or dark, chosen by the viewer, set before the page paints
(function () {
  const KEY = 'pf-theme';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (saved === 'light') document.documentElement.dataset.theme = 'light';
  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('header nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-btn';
    const sync = () => {
      const light = document.documentElement.dataset.theme === 'light';
      btn.setAttribute('aria-pressed', String(light));
      btn.setAttribute('aria-label', light ? 'Switch to the dark theme' : 'Switch to the light theme');
      btn.title = btn.getAttribute('aria-label');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = light ? '#F6F5FB' : '#07070D';
    };
    btn.addEventListener('click', () => {
      const light = document.documentElement.dataset.theme !== 'light';
      if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
      try { localStorage.setItem(KEY, light ? 'light' : 'dark'); } catch (e) { /* storage blocked */ }
      sync();
      window.dispatchEvent(new Event('themechange'));
    });
    sync();
    (document.querySelector('.search-open') || nav).after(btn);
  });
})();
