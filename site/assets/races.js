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
      (info.tyres ? ' · lap charts and tyres' : info.laps ? ' · lap charts' : ' · results');
    $('rounds').replaceChildren(...season.rounds.map(card));
  }

  function card(r) {
    const date = r.date ? new Date(r.date + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    const body = [
      el('span', { class: 'rc-top mono' }, el('span', null, 'R' + PF.pad2(r.round)), el('span', null, date)),
      el('span', { class: 'rc-name' }, r.name.replace(' Grand Prix', ' GP')),
      el('span', { class: 'rc-where' }, r.country),
    ];
    if (r.winner) {
      body.push(el('span', { class: 'rc-win' },
        el('span', { class: 'code mono' }, r.winner.code), r.winner.name,
        el('span', { class: 'rc-team' }, r.winner.team)));
      body.push(el('span', { class: 'rc-tags mono' },
        r.laps ? el('span', { class: 'rc-tag' }, 'LAP CHART') : null,
        r.tyres ? el('span', { class: 'rc-tag rc-tag-hot' }, 'TYRES') : null));
      return el('a', { class: 'race-card', href: '/races/' + year + '/' + r.round }, ...body);
    }
    body.push(el('span', { class: 'rc-soon mono' }, r.done ? 'NO RESULT' : 'UPCOMING'));
    return el('div', { class: 'race-card is-soon' }, ...body);
  }
})();
