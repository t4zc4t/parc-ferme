// every circuit, with its shape where a replay traced it
(async function () {
  const { $, el } = PF;
  let data, cal;
  try {
    [data, cal] = await Promise.all([PF.json('/data/circuits/index.json'), PF.json('/data/schedule.json')]);
  } catch (e) {
    $('c-list').textContent = 'The circuits could not be loaded right now.';
    return;
  }
  PF.stamp();
  const now = new Set(cal.rounds.map(r => r.circuit.id || r.circuit.circuitId).filter(Boolean));
  const names = new Set(cal.rounds.map(r => r.circuit.name));
  let show = 'all';
  const cards = data.circuits.map(c => {
    const shape = c.track ? PF.trackSvg(c.track, 'ct-mini') : el('span', { class: 'ct-mini ct-none', 'aria-hidden': 'true' });
    const card = el('a', { class: 'ct-card', href: '/circuits/' + c.id }, shape,
      el('span', { class: 'ct-card-name' }, c.name),
      el('span', { class: 'ct-card-where' }, [c.locality, c.country].filter(Boolean).join(', ')),
      el('span', { class: 'ct-card-meta' }, c.held + (c.held === 1 ? ' race' : ' races') + ', ' + (c.first === c.last ? c.first : c.first + '–' + c.last)),
      c.king ? el('span', { class: 'ct-card-king' }, 'Most wins: ' + c.king.name + ' (' + c.king.wins + ')') : '');
    card.dataset.text = [c.name, c.locality, c.country].join(' ').toLowerCase();
    card.dataset.now = now.has(c.id) || names.has(c.name) ? '1' : '';
    return card;
  });
  $('c-list').replaceChildren(...cards);
  function filter() {
    const q = $('c-q').value.trim().toLowerCase();
    let n = 0;
    cards.forEach(c => { const ok = (!q || c.dataset.text.includes(q)) && (show === 'all' || c.dataset.now); c.hidden = !ok; n += ok; });
    $('c-empty').hidden = n > 0;
  }
  $('c-q').addEventListener('input', filter);
  document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => {
    show = b.dataset.show;
    document.querySelectorAll('[data-show]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    filter();
  }));
})();
