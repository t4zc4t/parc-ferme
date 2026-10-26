// race explorer: every round of a season
(async function () {
  const { $, el } = PF;
  let index;
  try {
    index = await PF.json('/data/races/index.json');
  } catch (e) {
    $('rounds').replaceChildren(el('p', { class: 'dim' }, 'The race list could not be loaded right now.'));
    return;
  }
  PF.stamp();

  const years = index.years.filter(y => y.races > 0 || y === index.years[0]).map(y => y.year);
  const asked = +new URLSearchParams(location.search).get('y');
  let year = years.includes(asked) ? asked : years[0];

  const sel = $('year');
  years.forEach(y => sel.append(el('option', { value: y }, String(y))));
  sel.addEventListener('change', () => go(+sel.value));
  // the list runs newest first, so "previous" is the next index along
  $('prev-year').addEventListener('click', () => go(years[years.indexOf(year) + 1]));
  $('next-year').addEventListener('click', () => go(years[years.indexOf(year) - 1]));

  let rounds = [], show = 'all';
  const teamSel = $('race-team');
  $('race-q').addEventListener('input', filter);
  teamSel.addEventListener('change', filter);
  document.querySelectorAll('[data-show]').forEach(btn => btn.addEventListener('click', () => {
    show = btn.dataset.show;
    document.querySelectorAll('[data-show]').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', b === btn); });
    filter();
  }));
  $('race-reset').addEventListener('click', () => {
    $('race-q').value = ''; teamSel.value = '';
    document.querySelector('[data-show="all"]').click();
  });

  go(year);

  async function go(y) {
    if (!y) return;
    year = y;
    sel.value = y;
    $('prev-year').disabled = years.indexOf(y) === years.length - 1;
    $('next-year').disabled = years.indexOf(y) === 0;
    history.replaceState(null, '', '/races?y=' + y);
    let season;
    try {
      season = await PF.json('/data/races/' + y + '.json');
    } catch (e) {
      $('rounds').replaceChildren(el('p', { class: 'dim' }, 'This season could not be loaded right now.'));
      return;
    }
    if (y !== year) return;
    const done = season.rounds.filter(r => r.done).length;
    const info = index.years.find(x => x.year === y);
    $('year-note').textContent = done + ' of ' + season.rounds.length + ' races run' +
      (y >= 2026 ? ', with race replays' : info.tyres ? ', with lap charts and tyres' : info.laps ? ', with lap charts' : '');
    rounds = season.rounds;
    const teams = [...new Set(rounds.filter(r => r.winner).map(r => r.winner.team))].sort();
    const keep = teamSel.value;
    teamSel.replaceChildren(el('option', { value: '' }, 'Any winning team'), ...teams.map(t => el('option', { value: t }, t)));
    teamSel.value = teams.includes(keep) ? keep : '';
    $('rounds').replaceChildren(...rounds.map(card));
    filter();
  }

  function filter() {
    const q = $('race-q').value.trim().toLowerCase();
    const team = teamSel.value;
    let shown = 0;
    $('rounds').querySelectorAll('.race-card').forEach((node, i) => {
      const r = rounds[i];
      const text = [r.name, r.country, r.winner && r.winner.name, r.winner && r.winner.team, r.winner && r.winner.code].join(' ').toLowerCase();
      const ok = (!q || text.includes(q)) && (!team || (r.winner && r.winner.team === team)) &&
        (show === 'all' || (show === 'done' ? !!r.winner : !r.winner));
      node.hidden = !ok;
      shown += ok;
    });
    $('race-empty').hidden = shown > 0;
  }

  function card(r) {
    const date = r.date ? new Date(r.date + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    const body = [
      el('span', { class: 'rc-top' }, el('span', null, 'Round ' + r.round), el('span', null, date)),
      el('span', { class: 'rc-name' }, r.name.replace(' Grand Prix', ' GP')),
      el('span', { class: 'rc-where' }, r.country),
    ];
    if (r.winner) {
      body.push(el('span', { class: 'rc-win' },
        el('span', { class: 'rc-win-label' }, 'Winner'),
        el('span', null, el('span', { class: 'code' }, r.winner.code), r.winner.name),
        el('span', { class: 'rc-team' }, r.winner.team)));
      if (r.replay) body.push(el('span', { class: 'rc-badge' }, 'Replay'));
      return el('a', { class: 'race-card', href: '/races/' + year + '/' + r.round }, ...body);
    }
    body.push(el('span', { class: 'rc-soon' }, r.done ? 'No result' : 'Upcoming'));
    return el('div', { class: 'race-card is-soon' }, ...body);
  }
})();
