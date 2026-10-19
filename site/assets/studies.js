// studies: longer reads, each split into a few parts with a chart
(async function () {
  const { $, el } = PF;
  let data;
  try {
    data = await PF.json('/data/studies.json');
  } catch (e) {
    $('s-list').replaceChildren(el('p', { class: 'dim' }, 'The studies could not be loaded right now.'));
    return;
  }
  PF.stamp();

  $('s-index').replaceChildren(...data.studies.map((s, i) =>
    el('a', { class: 's-jump', href: '#' + s.id },
      el('span', { class: 's-jump-num mono' }, 'STUDY ' + PF.pad2(i + 1)),
      el('span', { class: 's-jump-title' }, s.title),
      el('span', { class: 's-jump-answer' }, s.answer))));

  $('s-list').replaceChildren(...data.studies.map((s, i) => study(s, i)));
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }

  function study(s, i) {
    return el('article', { class: 's-card', id: s.id },
      el('div', { class: 'q-head' },
        el('span', { class: 'q-num mono' }, 'STUDY ' + PF.pad2(i + 1)),
        el('a', { class: 'q-link mono', href: '#' + s.id, 'aria-label': 'Link to this study' }, '#')),
      el('h2', { class: 's-title' }, s.title),
      el('p', { class: 'q-answer' }, s.answer),
      el('p', { class: 's-intro' }, s.intro),
      ...s.parts.map((p, j) => el('section', { class: 's-part' },
        el('h3', { class: 's-part-h' }, el('span', { class: 'mono' }, PF.pad2(j + 1)), p.h),
        PF.chart(p.chart),
        el('p', { class: 's-text' }, p.text))),
      el('details', { class: 's-method' },
        el('summary', { class: 'mono' }, 'HOW THIS WAS COUNTED'),
        el('p', null, s.method)));
  }
})();
