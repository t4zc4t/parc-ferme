// every constructor
(async function () {
  const { $, el } = PF;
  let data;
  try {
    data = await PF.json('/data/teams/index.json');
  } catch (e) {
    PF.fail($('t-list'), 5, 'The teams could not be loaded right now.');
    return;
  }
  PF.stamp();
  const newest = Math.max(...data.teams.map(t => t.last));
  let show = 'winners';
  const rows = data.teams.map(t => {
    const tr = el('tr', null,
      el('td', { class: 'driver' }, el('a', { href: '/teams/' + t.id }, t.name)),
      el('td', { class: 'mono dim' }, t.first === t.last ? t.first : t.first + '–' + t.last),
      el('td', { class: 'num mono' }, t.entries), el('td', { class: 'num mono' }, t.wins), el('td', { class: 'num mono' }, t.titles || ''));
    tr.dataset.text = t.name.toLowerCase();
    tr.dataset.wins = t.wins;
    tr.dataset.now = t.last === newest ? '1' : '';
    return tr;
  });
  $('t-list').replaceChildren(...rows);
  function filter() {
    const q = $('t-q').value.trim().toLowerCase();
    rows.forEach(r => { r.hidden = !((!q || r.dataset.text.includes(q)) && (show === 'all' || (show === 'now' ? r.dataset.now : +r.dataset.wins > 0))); });
  }
  $('t-q').addEventListener('input', filter);
  document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => {
    show = b.dataset.show;
    document.querySelectorAll('[data-show]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    filter();
  }));
  filter();
})();
