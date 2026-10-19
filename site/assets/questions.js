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
      PF.chart(q.chart),
      el('p', { class: 'q-body' }, q.body),
      q.links && q.links.length ? el('div', { class: 'q-links' }, ...q.links.map(l =>
        el('a', { class: 'q-go', href: l.href }, l.label, ' →'))) : null);
  }
})();
