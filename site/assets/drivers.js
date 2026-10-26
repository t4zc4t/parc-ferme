// drivers grid
(async function () {
  const { $, el } = PF;
  const grid = $('grid');
  let data;
  try {
    data = await PF.json('/data/drivers.json');
  } catch (e) {
    grid.textContent = 'The drivers could not be loaded right now.';
    return;
  }
  PF.stamp();
  $('grid-lede').textContent = 'All ' + data.drivers.length + ' drivers to start a race in ' + data.season + '. Pick one for their career, season by season, and how they stack up against their teammate.';

  const sorts = {
    pos: (a, b) => (+a.pos || 99) - (+b.pos || 99),
    wins: (a, b) => b.wins - a.wins || b.races - a.races,
    races: (a, b) => b.races - a.races,
    team: (a, b) => a.team.localeCompare(b.team) || (+a.pos || 99) - (+b.pos || 99)
  };

  const q = $('d-q'), team = $('d-team'), nat = $('d-nat'), sortSel = $('d-sort');
  const opts = (sel, vals) => sel.append(...[...new Set(vals.filter(Boolean))].sort().map(v => el('option', { value: v }, v)));
  opts(team, data.drivers.map(d => d.team));
  opts(nat, data.drivers.map(d => d.nationality));
  [q, team, nat, sortSel].forEach(x => x.addEventListener(x === q ? 'input' : 'change', render));

  function render() {
    const key = sortSel.value;
    const text = q.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    grid.textContent = '';
    data.drivers.slice().sort(sorts[key]).filter(d =>
      (!text || (d.name + ' ' + d.code).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(text)) &&
      (!team.value || d.team === team.value) && (!nat.value || d.nationality === nat.value)
    ).forEach(d => {
      grid.append(el('a', { class: 'dcard', href: '/drivers/' + d.id },
        el('span', { class: 'dcard-num', 'aria-hidden': 'true' }, d.number || ''),
        el('span', { class: 'dcard-top' },
          el('span', { class: 'code' }, d.code),
          el('span', { class: 'dcard-pos' }, 'P' + d.pos + ', ' + d.points + ' pts')
        ),
        el('span', { class: 'dcard-name' }, d.name),
        el('span', { class: 'dcard-team' }, d.team + (d.nationality ? ', ' + d.nationality : '')),
        el('span', { class: 'dcard-stats' },
          el('span', null, el('b', null, d.races), ' races'),
          el('span', null, el('b', null, d.wins), ' wins'),
          d.titles ? el('span', { class: 'gold' }, el('b', null, d.titles), d.titles > 1 ? ' titles' : ' title') : null
        )
      ));
    });
    $('d-empty').hidden = grid.children.length > 0;
  }
  render();
})();
