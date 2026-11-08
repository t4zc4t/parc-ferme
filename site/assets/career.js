// a driver's whole career, for everyone since 1950
(async function () {
  const { $, el } = PF;
  const id = location.pathname.split('/').filter(Boolean).pop();
  let p;
  try {
    p = await PF.json('/data/careers/' + encodeURIComponent(id) + '.json');
  } catch (e) {
    $('p-name').textContent = 'Driver not found';
    return;
  }
  PF.stamp();
  document.title = p.name + ': F1 career, wins and seasons · Parc Fermé';
  $('p-name').textContent = p.name;
  const yrs = p.seasons.map(s => s.year);
  const span = yrs[0] === yrs[yrs.length - 1] ? 'in ' + yrs[0] : 'from ' + yrs[0] + ' to ' + yrs[yrs.length - 1];
  $('p-meta').textContent = [p.nat, p.dob ? 'born ' + new Date(p.dob + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null].filter(Boolean).join(', ') +
    (p.nat || p.dob ? '. ' : '') + 'Raced in Formula 1 ' + span + ' for ' + p.teams.map(t => t.name).join(', ') + '.';
  $('p-actions').append(
    el('a', { class: 'btn btn-quiet', href: '/compare?a=' + encodeURIComponent(p.id) }, 'Compare with anyone'),
    PF.shareButton(() => ({ title: p.name, text: p.name + ' in Formula 1', url: '/drivers/' + p.id })));
  const tile = (label, value, note) => el('div', { class: 'tile' }, el('span', { class: 'tile-label' }, label), el('span', { class: String(value).length > 8 ? 'tile-value tile-text' : 'tile-value' }, String(value)), note ? el('span', { class: 'tile-sub' }, note) : '');
  $('p-tiles').replaceChildren(
    tile('Starts', p.starts), tile('Wins', p.wins), tile('Podiums', p.podiums), tile('Poles', p.poles),
    tile('Titles', p.titles.length, p.titles.join(', ')), tile('Best finish', p.best ? 'P' + p.best : '–', p.wins ? '' : 'never won'));
  $('p-seasons').replaceChildren(...[...p.seasons].reverse().map(s => el('tr', { class: s.pos === '1' || s.pos === 1 ? 'top3' : null },
    el('td', { class: 'mono' }, el('a', { href: '/standings?y=' + s.year }, s.year)),
    el('td', { class: 'team' }, s.teams.join(', ')),
    el('td', { class: 'num mono' }, s.races), el('td', { class: 'num mono' }, s.wins || ''),
    el('td', { class: 'num mono opt' }, s.podiums || ''), el('td', { class: 'num mono opt' }, s.poles || ''),
    el('td', { class: 'num mono' }, s.pos ? 'P' + s.pos : '–'))));
  if (p.winList.length) {
    $('p-wins-block').hidden = false;
    $('p-wins-title').textContent = p.winList.length === 1 ? 'The win' : 'All ' + p.winList.length + ' wins';
    $('p-wins').replaceChildren(...p.winList.map(w => el('li', null,
      el('a', { href: '/races/' + w.year + '/' + w.round }, w.year + ' ' + w.name), el('span', { class: 'dim' }, ' ' + w.team + (w.grid ? ', from P' + w.grid : '')))));
  }
})();
