// Small helpers shared by every page.
const PF = {
  $: id => document.getElementById(id),

  // el('td', {class: 'num'}, 'text', childNode, ...)
  el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
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

  driverLink(id, ...kids) {
    return PF.el('a', { href: '/drivers/' + id, class: 'dlink' }, ...kids);
  },

  stamp(updated) {
    const node = PF.$('updated');
    if (!node || !updated) return;
    const d = new Date(updated);
    node.textContent = 'Data: Jolpica · updated ' + d.toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  },

  fail(target, colspan, text) {
    target.textContent = '';
    target.append(PF.el('tr', { class: 'empty' }, PF.el('td', { colspan }, text)));
  }
};
