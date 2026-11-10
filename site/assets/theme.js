// two looks, Port Mafia (default) and Detective Agency, set before the page paints
(function () {
  const KEY = 'pf-theme';
  const THEMES = [
    { id: 'mafia', name: 'Port Mafia', color: '#0B0909' },
    { id: 'agency', name: 'Detective Agency', color: '#FBF7EF' },
  ];
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (saved === 'light' || saved === 'paper') saved = 'agency';   // older light looks
  const apply = id => {
    if (id && id !== 'mafia') document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
  };
  apply(THEMES.some(t => t.id === saved) ? saved : 'mafia');
  const current = () => document.documentElement.dataset.theme || 'mafia';

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('header nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-btn';
    const sync = () => {
      const i = THEMES.findIndex(t => t.id === current());
      const next = THEMES[(i + 1) % THEMES.length];
      btn.dataset.look = THEMES[i].id;
      btn.setAttribute('aria-label', 'Theme: ' + THEMES[i].name + '. Switch to ' + next.name);
      btn.title = btn.getAttribute('aria-label');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = THEMES[i].color;
    };
    btn.addEventListener('click', () => {
      const i = THEMES.findIndex(t => t.id === current());
      const next = THEMES[(i + 1) % THEMES.length].id;
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked */ }
      sync();
      window.dispatchEvent(new Event('themechange'));
    });
    sync();
    const search = document.querySelector('.search-open');
    if (search) search.before(btn); else nav.after(btn);
  });
})();
