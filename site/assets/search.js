// site search: drivers, teams, this season's races, questions, studies and pages
(function () {
  const { el } = PF;
  const nav = document.querySelector('header nav');
  if (!nav) return;
  const open = el('button', { type: 'button', class: 'search-open', 'aria-haspopup': 'dialog', 'aria-label': 'Search the site', title: 'Search (press /)' },
    el('span', { 'aria-hidden': 'true', class: 'search-icon' }), el('span', { class: 'search-word' }, 'Search'));
  nav.after(open);

  const input = el('input', { type: 'search', class: 'search-input', placeholder: 'Drivers, races, seasons, questions', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false' });
  const list = el('ul', { class: 'search-list', role: 'listbox', id: 'search-list' });
  const hint = el('p', { class: 'search-hint' }, 'Try a driver, a Grand Prix or a year.');
  const dialog = el('dialog', { class: 'search-dialog', 'aria-label': 'Search' },
    el('div', { class: 'search-box' }, input, el('button', { type: 'button', class: 'search-close', 'aria-label': 'Close' }, 'Esc')), hint, list);
  document.body.append(dialog);
  dialog.querySelector('.search-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  let items = null, hits = [], active = 0;
  async function load() {
    if (items) return;
    items = [
      ['Standings', '/standings', 'Page'], ['Schedule', '/schedule', 'Page'], ['Drivers', '/drivers', 'Page'],
      ['Compare drivers', '/compare', 'Page'], ['Races', '/races', 'Page'], ['Studies', '/studies', 'Page'], ['Questions', '/questions', 'Page'],
    ].map(([name, href, kind]) => ({ name, href, kind, rank: 1 }));
    const get = p => PF.json(p).catch(() => null);
    const [people, grid, schedule, qs, studies, index] = await Promise.all([
      get('/data/people.json'), get('/data/drivers.json'), get('/data/schedule.json'),
      get('/data/questions.json'), get('/data/studies.json'), get('/data/races/index.json')]);
    const now = new Set(grid ? grid.drivers.map(d => d.id) : []);
    if (people) {
      people.drivers.forEach(([id, name, code, from, to, starts, wins]) => items.push({
        name, extra: code || '', kind: from === to ? String(from) : from + '–' + to,
        href: now.has(id) ? '/drivers/' + id : '/compare?a=' + encodeURIComponent(id),
        rank: (now.has(id) ? 3 : 0) + Math.min(starts / 100, 2) + wins / 50 }));
    }
    if (schedule) schedule.rounds.forEach(r => items.push({
      name: schedule.season + ' ' + r.name, extra: r.circuit.name + ' ' + r.circuit.locality + ' ' + r.circuit.country,
      kind: 'Round ' + r.round, href: '/races/' + schedule.season + '/' + r.round, rank: 2 }));
    if (index) index.years.forEach(y => items.push({ name: y.year + ' season', extra: String(y.year), kind: y.races + ' races', href: '/races?y=' + y.year, rank: 1 }));
    if (qs) qs.questions.forEach(q => items.push({ name: q.q, kind: 'Question', href: '/questions#' + q.id, rank: 1 }));
    if (studies) studies.studies.forEach(s => items.push({ name: s.title || s.q || s.id, extra: s.answer || '', kind: 'Study', href: '/studies#' + s.id, rank: 1 }));
    items.forEach(it => { it.hay = fold(it.name + ' ' + (it.extra || '')); });
  }
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function run() {
    const q = fold(input.value.trim());
    if (!q || !items) { list.replaceChildren(); hint.hidden = false; return; }
    const words = q.split(/\s+/);
    hits = items.map(it => {
      if (!words.every(w => it.hay.includes(w))) return null;
      const name = fold(it.name);
      const score = (name.startsWith(q) ? 6 : 0) + (name.split(/\s+/).some(p => p.startsWith(words[0])) ? 3 : 0) + it.rank;
      return [score, it];
    }).filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 12).map(h => h[1]);
    active = 0;
    hint.hidden = hits.length > 0;
    hint.textContent = hits.length ? '' : 'Nothing found for "' + input.value.trim() + '".';
    paint();
  }
  function paint() {
    list.replaceChildren(...hits.map((it, i) => el('li', { role: 'option', 'aria-selected': i === active },
      el('a', { href: it.href, class: 'search-hit' + (i === active ? ' on' : '') },
        el('span', { class: 'search-name' }, it.name), el('span', { class: 'search-kind' }, it.kind)))));
  }
  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      paint();
    } else if (e.key === 'Enter' && hits[active]) {
      location.href = hits[active].href;
      dialog.close();
    }
  });
  async function show() {
    dialog.showModal();
    input.focus();
    input.select();
    hint.textContent = 'Try a driver, a Grand Prix or a year.';
    await load();
    run();
  }
  open.addEventListener('click', show);
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing && !dialog.open) { e.preventDefault(); show(); }
  });
})();
