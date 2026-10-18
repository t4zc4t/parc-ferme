// questions: a card per question, answer first, then the numbers
(async function () {
  const { $, el } = PF;
  let data;
  try {
    data = await PF.json('/data/questions.json');
  } catch (e) {
    $('q-list').replaceChildren(el('p', { class: 'dim' }, 'The questions could not be loaded right now.'));
    return;
  }
  PF.stamp();

  $('q-index').replaceChildren(...data.questions.map((q, i) =>
    el('a', { class: 'q-jump', href: '#' + q.id }, el('span', { class: 'mono' }, PF.pad2(i + 1)), q.q)));

  $('q-list').replaceChildren(...data.questions.map((q, i) => card(q, i)));
  // the index links only work once the cards exist
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }

  function card(q, i) {
    return el('article', { class: 'q-card', id: q.id },
      el('div', { class: 'q-head' },
        el('span', { class: 'q-num mono' }, 'Q' + PF.pad2(i + 1)),
        el('a', { class: 'q-link mono', href: '#' + q.id, 'aria-label': 'Link to this question' }, '#')),
      el('h2', { class: 'q-title' }, q.q),
      el('p', { class: 'q-answer' }, q.answer),
      chart(q.chart),
      el('p', { class: 'q-body' }, q.body),
      q.links && q.links.length ? el('div', { class: 'q-links' }, ...q.links.map(l =>
        el('a', { class: 'q-go', href: l.href }, l.label, ' →'))) : null);
  }

  function chart(c) {
    if (!c) return null;
    const box = el('div', { class: 'q-chart' }, c.title ? el('p', { class: 'q-chart-title mono' }, c.title.toUpperCase()) : null);
    if (c.type === 'pairs') {
      box.append(el('div', { class: 'pairs', style: '--n:' + c.cols.length },
        el('span', { class: 'pairs-corner' }),
        ...c.cols.map(h => el('span', { class: 'pairs-col mono' }, h)),
        ...c.rows.flatMap(r => [
          el('span', { class: 'pairs-label' }, r.label),
          ...r.values.map((v, j) => el('span', { class: 'pairs-v' + (r.better === j ? ' on' : '') }, v)),
        ])));
      return box;
    }
    if (c.type === 'list') {
      if (!c.rows.length) { box.append(el('p', { class: 'dim' }, 'None yet.')); return box; }
      box.append(el('ul', { class: 'q-flips' }, ...c.rows.map(r =>
        el('li', null, el(r.href ? 'a' : 'span', { href: r.href || null, class: 'flip-race' }, r.label),
          el('span', { class: 'flip-who mono' }, r.display)))));
      return box;
    }
    // bars: longest bar is the biggest value, or the smallest when lower is better
    const vals = c.rows.map(r => r.value);
    const max = Math.max(...vals.map(Math.abs)) || 1;
    const min = Math.min(...vals);
    box.append(el('div', { class: 'bars' + (c.diverging ? ' bars-div' : '') }, ...c.rows.map(r => {
      let w;
      if (c.diverging) w = Math.abs(r.value) / max * 50;
      else if (c.lower) w = 30 + 70 * (min / r.value);
      else w = Math.max(2, 100 * r.value / max);
      const fill = el('span', { class: 'bar-fill' + (r.hot ? ' hot' : '') + (c.diverging && r.value < 0 ? ' neg' : ''),
        style: c.diverging ? (r.value >= 0 ? 'left:50%;' : 'right:50%;') + 'width:' + w.toFixed(1) + '%' : 'width:' + w.toFixed(1) + '%' });
      const label = r.href ? el('a', { href: r.href }, r.label) : r.label;
      return el('div', { class: 'bar-row' + (r.hot ? ' hot' : '') },
        el('span', { class: 'bar-label' }, label),
        el('span', { class: 'bar-track' }, fill),
        el('span', { class: 'bar-val mono' }, r.display ?? r.value));
    })));
    return box;
  }
})();
