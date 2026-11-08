// one constructor: titles, seasons and drivers
(async function () {
  const { $, el } = PF;
  const id = location.pathname.split('/').filter(Boolean).pop();
  let t;
  try {
    t = await PF.json('/data/teams/' + encodeURIComponent(id) + '.json');
  } catch (e) {
    $('t-name').textContent = 'Team not found';
    return;
  }
  PF.stamp();
  document.title = t.name + ': F1 wins, titles and drivers · Parc Fermé';
  $('t-name').textContent = t.name;
  $('t-meta').textContent = (t.nat ? t.nat + ' team, ' : '') + 'in Formula 1 ' + (t.first === t.last ? 'in ' + t.first : 'from ' + t.first + ' to ' + t.last) +
    ', ' + t.entries + (t.entries === 1 ? ' race.' : ' races.');
  $('t-actions').append(PF.shareButton(() => ({ title: t.name, text: t.name + ' in Formula 1', url: '/teams/' + t.id })));
  const tile = (label, value) => el('div', { class: 'tile' }, el('span', { class: 'tile-label' }, label), el('span', { class: String(value).length > 8 ? 'tile-value tile-text' : 'tile-value' }, String(value)));
  $('t-tiles').replaceChildren(tile('Wins', t.wins), tile('Podiums', t.podiums), tile('Poles', t.poles), tile('One-twos', t.oneTwos),
    tile('Constructors\' titles', t.titles.length), tile('Drivers\' titles', t.driverTitles.length));
  // a bar per season, taller for a better finish, wins as a pink cap
  const seasons = t.seasons;
  const W = Math.max(320, seasons.length * 14), H = 150;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 18}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Championship position by season');
  const worst = Math.max(...seasons.map(s => s.pos || 0), 10);
  const bw = W / seasons.length;
  seasons.forEach((s, i) => {
    const h = s.pos ? H * (worst - s.pos + 1) / worst : 4;
    const r = document.createElementNS(ns, 'rect');
    Object.entries({ x: i * bw + 1, y: H - h, width: Math.max(2, bw - 2), height: h, class: s.pos === 1 ? 'tm-bar tm-top' : 'tm-bar' }).forEach(([k, v]) => r.setAttribute(k, v));
    const tip = document.createElementNS(ns, 'title');
    tip.textContent = s.year + ': ' + (s.pos ? 'P' + s.pos : 'no constructors\' standings') + (s.pts != null ? ', ' + s.pts + ' pts' : '') + (s.wins ? ', ' + s.wins + (s.wins === 1 ? ' win' : ' wins') : '');
    r.append(tip);
    svg.append(r);
    if (s.wins) {
      const cap = document.createElementNS(ns, 'rect');
      Object.entries({ x: i * bw + 1, y: H - h - 4, width: Math.max(2, bw - 2), height: 3, class: 'tm-win' }).forEach(([k, v]) => cap.setAttribute(k, v));
      svg.append(cap);
    }
    const step = Math.ceil(seasons.length / 10);
    if ((i % step === 0 && seasons.length - 1 - i >= step / 2) || i === seasons.length - 1) {
      const tx = document.createElementNS(ns, 'text');
      Object.entries({ x: i === 0 ? 0 : i === seasons.length - 1 ? W : i * bw + bw / 2, y: H + 14, 'text-anchor': i === 0 ? 'start' : i === seasons.length - 1 ? 'end' : 'middle', class: 'tm-axis' }).forEach(([k, v]) => tx.setAttribute(k, v));
      tx.textContent = s.year;
      svg.append(tx);
    }
  });
  $('t-chart').append(svg);
  $('t-titles').replaceChildren(
    el('p', null, el('b', null, 'Constructors: '), t.titles.length ? t.titles.join(', ') : 'none yet'),
    el('p', null, el('b', null, 'Drivers: '), t.driverTitles.length ? '' : 'none yet',
      ...t.driverTitles.map((x, i) => [i ? ', ' : '', el('a', { href: PF.driverHref(x.id) }, x.name + ' ' + x.year)]).flat()));
  const win = (label, w) => w ? el('p', null, el('b', null, label + ': '), el('a', { href: '/races/' + w.year + '/' + w.round }, w.year + ' ' + w.name), ', ', el('a', { href: PF.driverHref(w.driver.id) }, w.driver.name)) : '';
  $('t-firsts').replaceChildren(win('First win', t.firstWin), win('Latest win', t.lastWin),
    el('p', null, el('b', null, 'Best season: '), (() => { const b = seasons.filter(s => s.pos).sort((a, b) => a.pos - b.pos || b.wins - a.wins)[0]; return b ? b.year + ', P' + b.pos + (b.wins ? ' with ' + b.wins + (b.wins === 1 ? ' win' : ' wins') : '') : '–'; })()));
  $('t-drivers').replaceChildren(...t.drivers.map(d => el('tr', null,
    el('td', { class: 'driver' }, PF.driverLink(d.id, d.name)), el('td', { class: 'mono dim' }, d.years),
    el('td', { class: 'num mono' }, d.races), el('td', { class: 'num mono' }, d.wins), el('td', { class: 'num mono opt' }, d.podiums))));
})();
