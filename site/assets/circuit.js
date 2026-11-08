// one circuit: its shape, records and every race held there
(async function () {
  const { $, el } = PF;
  const id = location.pathname.split('/').filter(Boolean).pop();
  let c;
  try {
    c = await PF.json('/data/circuits/' + encodeURIComponent(id) + '.json');
  } catch (e) {
    $('c-name').textContent = 'Circuit not found';
    return;
  }
  PF.stamp();
  document.title = c.name + ': F1 winners and records · Parc Fermé';
  $('c-name').textContent = c.name;
  $('c-meta').textContent = [c.locality, c.country].filter(Boolean).join(', ') + '. ' + c.held + (c.held === 1 ? ' championship race, ' : ' championship races, ') +
    (c.first === c.last ? 'in ' + c.first : 'from ' + c.first + ' to ' + c.last) + '.';
  $('c-actions').append(PF.shareButton(() => ({ title: c.name, text: c.name + ': every F1 winner and record', url: '/circuits/' + c.id })));
  if (c.track) {
    $('c-shape-panel').hidden = false;
    $('c-shape').append(PF.trackSvg(c.track, 'ct-big'));
    $('c-shape-note').textContent = 'Traced from the cars\' positions in the most recent race with a replay.';
  }
  const last = c.races[0];
  const tile = (label, value, note) => el('div', { class: 'tile' }, el('span', { class: 'tile-label' }, label), el('span', { class: String(value).length > 8 ? 'tile-value tile-text' : 'tile-value' }, value), note ? el('span', { class: 'tile-sub' }, note) : '');
  $('c-tiles').replaceChildren(
    tile('Races held', String(c.held)),
    tile('Pole to win', c.poleWins == null ? '–' : c.poleWins + '%', 'how often the pole sitter won'),
    tile('Most wins', c.topDrivers[0] ? String(c.topDrivers[0].wins) : '–', c.topDrivers[0] ? c.topDrivers[0].name : ''),
    tile('Last winner', last && last.winner ? last.winner.name : '–', last ? String(last.year) : ''));
  const rank = (list, key, href) => list.map(x => el('li', null, href(x) ? el('a', { href: href(x) }, x.name) : x.name, el('span', { class: 'num-font' }, x[key])));
  $('c-drivers').replaceChildren(...rank(c.topDrivers, 'wins', x => PF.driverHref(x.id)));
  $('c-poles').replaceChildren(...rank(c.topPoles, 'poles', x => PF.driverHref(x.id)));
  $('c-teams').replaceChildren(...rank(c.topTeams, 'wins', x => '/teams/' + x.id));
  $('c-races').replaceChildren(...c.races.map(r => el('tr', null,
    el('td', { class: 'mono' }, el('a', { href: '/races/' + r.year + '/' + r.round }, r.year)),
    el('td', { class: 'driver' }, r.winner ? PF.driverLink(r.winner.id, r.winner.name) : '–'),
    el('td', { class: 'team opt' }, r.winner ? r.winner.team : ''),
    el('td', { class: 'opt' }, r.pole ? r.pole.name + (r.winner && r.pole.id === r.winner.id ? ' (won)' : '') : '–'))));
})();
