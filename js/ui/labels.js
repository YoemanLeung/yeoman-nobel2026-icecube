// HTML labels pinned to 3D points. Terms and units live in this 2D layer (crisp at any zoom),
// never as textures that shrink with the camera.

export function createLabelLayer(root) {
  const nodes = new Map();

  function ensure(id) {
    let el = nodes.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'tag';
      root.appendChild(el);
      nodes.set(id, el);
    }
    return el;
  }

  return {
    /** items: [{id, x, y, text, o, cls}] in CSS pixels */
    render(items) {
      const seen = new Set();
      items.forEach((it) => {
        if (!(it.o > 0.02) || !Number.isFinite(it.x)) return;
        seen.add(it.id);
        const el = ensure(it.id);
        if (el.textContent !== it.text) el.textContent = it.text;
        const cls = `tag ${it.cls || ''}`;
        if (el.className !== cls) el.className = cls;
        el.style.opacity = String(Math.min(1, it.o));
        el.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px)`;
      });
      nodes.forEach((el, id) => {
        if (!seen.has(id)) {
          el.remove();
          nodes.delete(id);
        }
      });
    },
  };
}
