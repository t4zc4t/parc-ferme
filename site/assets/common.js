// Small helpers shared by every page.
const PF = {
  $: id => document.getElementById(id),

  // el('td', {class: 'num'}, 'text', childNode, ...)
  el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      // styles go through the style object, which the site's security policy allows,
      // rather than a style attribute, which it blocks
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

  // "Andrea Kimi Antonelli" -> first names that can hide on phones, surname that always shows
  name(full) {
    const parts = String(full).split(' ');
    const last = parts.pop();
    return parts.length
      ? [PF.el('span', { class: 'fn' }, parts.join(' ') + ' '), last]
      : [last];
  },

  // title chance as words people trust: never 0% while it's still possible, never 100% until it's done
  chance(t) {
    if (t.clinched || (t.note || '').startsWith('Champion')) return 'CHAMPION';
    if (!t.alive) return 'OUT';
    if (t.prob >= 0.995) return '>99%';
    if (t.prob < 0.005) return '<1%';
    return Math.round(t.prob * 100) + '%';
  },

  driverLink(id, ...kids) {
    return PF.el('a', { href: '/drivers/' + id, class: 'dlink' }, ...kids);
  },

  // footer line: when the data last actually changed
  async stamp() {
    const node = PF.$('updated');
    if (!node) return;
    try {
      const meta = await PF.json('/data/meta.json');
      node.textContent = 'Data: Jolpica · updated ' + PF.dayTime(meta.updated);
    } catch (e) { /* keep the plain credit */ }
  },

  // "Sat 11 Oct, 17:30" in the viewer's own time zone
  dayTime(iso) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  },

  time(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  // done, live or upcoming, worked out here so the data files never change just because time passed
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
