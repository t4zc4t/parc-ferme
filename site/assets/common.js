// shared helpers
const PF = {
  $: id => document.getElementById(id),

  // el('td', {class: 'num'}, 'text', childNode, ...)
  el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      // cssText, the CSP blocks style attributes
      else if (k === 'style') node.style.cssText = v;
      else node.setAttribute(k, v);
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  },

  async json(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res.json();
  },

  pad2: n => String(n).padStart(2, '0'),

  // first names hide on phones
  name(full) {
    const parts = String(full).split(' ');
    const last = parts.pop();
    return parts.length
      ? [PF.el('span', { class: 'fn' }, parts.join(' ') + ' '), last]
      : [last];
  },

  // no 0% or 100% until it's actually settled
  chance(t) {
    if (t.clinched || (t.note || '').startsWith('Champion')) return 'CHAMPION';
    if (!t.alive) return 'OUT';
    if (t.prob >= 0.995) return '>99%';
    if (t.prob < 0.005) return '<1%';
    return Math.round(t.prob * 100) + '%';
  },

  top3(t) {
    if (t.top3Locked) return 'LOCKED';
    if (!t.top3Alive) return 'OUT';
    if (t.top3 >= 0.995) return '>99%';
    if (t.top3 < 0.005) return '<1%';
    return Math.round(t.top3 * 100) + '%';
  },

  driverLink(id, ...kids) {
    return PF.el('a', { href: '/drivers/' + id, class: 'dlink' }, ...kids);
  },

  // footer: last data change
  async stamp() {
    const node = PF.$('updated');
    if (!node) return;
    try {
      const meta = await PF.json('/data/meta.json');
      node.textContent = 'Data: Jolpica · updated ' + PF.dayTime(meta.updated);
    } catch (e) { /* keep the plain credit */ }
  },

  dayTime(iso) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  },

  time(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  // done/live/upcoming, done here so the data doesn't change with time
  status(session, now) {
    const start = Date.parse(session.start), end = Date.parse(session.end);
    return now >= end ? 'done' : now >= start ? 'live' : 'upcoming';
  },

  nextSession(schedule, now) {
    for (const r of schedule.rounds) {
      for (const s of r.sessions) {
        if (Date.parse(s.end) > now) return { round: r, session: s };
      }
    }
    return null;
  },

  fail(target, colspan, text) {
    target.textContent = '';
    target.append(PF.el('tr', { class: 'empty' }, PF.el('td', { colspan }, text)));
  }
};
