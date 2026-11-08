// a finished season in a dozen numbers
(async function () {
  const { $, el } = PF;
  let index;
  try {
    index = await PF.json('/data/wrapped/index.json');
  } catch (e) {
    $('w-hero').textContent = 'Wrapped could not be loaded right now.';
    return;
  }
  PF.stamp();
  const years = index.years;
  const asked = +new URLSearchParams(location.search).get('y');
  let year = years.includes(asked) ? asked : years[0];
  years.forEach(y => $('year').append(el('option', { value: y }, String(y))));
  $('year').addEventListener('change', () => go(+$('year').value));
  $('prev-year').addEventListener('click', () => go(years[years.indexOf(year) + 1]));
  $('next-year').addEventListener('click', () => go(years[years.indexOf(year) - 1]));
  $('share-slot').replaceWith(PF.shareButton(() => ({ title: year + ' F1 season wrapped', text: 'The ' + year + ' F1 season in a dozen numbers', url: '/wrapped?y=' + year })));
  const who = p => el('a', { href: PF.driverHref(p.id) }, p.name);
  const race = (y, rnd, name) => el('a', { href: '/races/' + y + '/' + rnd }, name);
  const card = (label, big, ...note) => el('div', { class: 'wr-card' }, el('span', { class: 'wr-label' }, label), el('span', { class: 'wr-big' }, big), el('p', { class: 'wr-note' }, ...note));
  go(year);

  async function go(y) {
    if (!y) return;
    year = y;
    $('year').value = y;
    $('prev-year').disabled = years.indexOf(y) === years.length - 1;
    $('next-year').disabled = years.indexOf(y) === 0;
    history.replaceState(null, '', '/wrapped?y=' + y);
    let w;
    try { w = await PF.json('/data/wrapped/' + y + '.json'); } catch (e) { return; }
    if (y !== year) return;
    const c = w.champion;
    $('w-hero').replaceChildren(
      el('span', { class: 'wr-label' }, y + ' world champion'),
      el('span', { class: 'wr-champ' }, who(c)),
      el('p', { class: 'wr-note' }, c.pts + ' points and ' + c.wins + (c.wins === 1 ? ' win' : ' wins') +
        (w.runnerUp ? ', ' + w.runnerUp.gap + ' clear of ' : ''), w.runnerUp ? who(w.runnerUp) : '', '.',
        w.teams ? ' ' + w.teams.name + ' took the constructors\' title.' : ''));
    const cards = [];
    if (w.decided) cards.push(w.decided.left
      ? card('Settled', w.decided.left + (w.decided.left === 1 ? ' race' : ' races') + ' early', 'Out of reach after the ', race(y, w.decided.round, w.decided.name), '.')
      : card('Settled', 'At the finale', 'Still open until the ', race(y, w.decided.round, w.decided.name), '.'));
    cards.push(card('Different winners', String(w.winners), 'in ' + w.races + ' races, from ' + w.winnerTeams + (w.winnerTeams === 1 ? ' team.' : ' teams.')));
    const led = [...new Map(w.leaders.map(l => [l.id, l])).values()];
    cards.push(card('Lead changes', String(w.leadChanges), !w.leaders.length ? '' : w.leadChanges === 0 ? [who(w.leaders[0]), ' led from start to finish.']
      : w.leaders.length <= 3 ? ['Led by ', w.leaders.map((l, i) => [i ? ', then ' : '', who(l), ' after the ', race(y, l.round, l.race)]), '.']
      : ['The lead swapped between ', led.map((l, i) => [i ? (i === led.length - 1 ? ' and ' : ', ') : '', who(l)]), ', last changing hands at the ', race(y, w.leaders[w.leaders.length - 1].round, w.leaders[w.leaders.length - 1].race), '.']));
    if (w.wins[0]) cards.push(card('Most wins', String(w.wins[0].n), who(w.wins[0]), w.wins[1] ? ', ahead of ' + w.wins[1].name + ' (' + w.wins[1].n + ').' : '.'));
    if (w.poles[0]) cards.push(card('Most poles', String(w.poles[0].n), who(w.poles[0]), '.'));
    if (w.podiums[0]) cards.push(card('Most podiums', String(w.podiums[0].n), who(w.podiums[0]), '.'));
    if (w.closest) cards.push(card('Closest finish', w.closest.gap.toFixed(3) + 's', who(w.closest.winner), ' beat ', who(w.closest), ' at the ', race(y, w.closest.round, w.closest.race), '.'));
    if (w.climb) cards.push(card('Biggest climb', '+' + w.climb.places, who(w.climb), ' went from P' + w.climb.from + ' to P' + w.climb.to + ' at the ', race(y, w.climb.round, w.climb.race), '.'));
    if (w.battle) cards.push(card('Qualifying battle', w.battle.a.n + '–' + w.battle.b.n, who(w.battle.a), ' against team mate ', who(w.battle.b), ', the most one-sided of the year.'));
    if (w.rookie) cards.push(card('Best rookie', w.rookie.pos ? 'P' + w.rookie.pos : '–', who(w.rookie), ', ' + w.rookie.pts + ' points in a first season.'));
    if (w.oneTwos[0]) cards.push(card('One-twos', String(w.oneTwos[0].n), el('a', { href: '/teams/' + w.oneTwos[0].id }, w.oneTwos[0].name), ' finished first and second the most.'));
    if (w.dnfs[0]) cards.push(card('Toughest luck', String(w.dnfs[0].n), who(w.dnfs[0]), ' failed to finish the most races.'));
    $('w-cards').replaceChildren(...cards);
  }
})();
