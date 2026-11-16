// A soft dot in place of the arrow everywhere, like the iPadOS pointer. Over the scene it reads the canvas's own cursor
// state (main.js still sets canvas.style.cursor to '', 'pointer', 'grab' or 'grabbing') and changes size to match:
// a little bigger over something you can poke or bend, tighter while you're holding on. Over the panel it swells over
// anything you can click or drag. On touch screens the ordinary behaviour is left alone.
const DOT = {
  size: 32,                                   // px at scale 1 (the element; each state scales it)
  scale: { '': 0.5, pointer: 0.85, grab: 0.72, grabbing: 0.42 },
  press: 0.82,                                // extra squeeze while a button is down
  follow: 0.55,                               // 1 = glued to the pointer, lower = a softer glide
};

export function initCursor(canvas) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;   // touch-first device: nothing to draw
  const style = document.createElement('style');
  style.textContent = `
    html, html * { cursor: none !important; }
    .dot-cursor { position: fixed; left: 0; top: 0; width: ${DOT.size}px; height: ${DOT.size}px; margin: ${-DOT.size / 2}px 0 0 ${-DOT.size / 2}px;
      pointer-events: none; z-index: 2147483647;   /* above everything, the panel included */ opacity: 0; transition: opacity 0.2s; will-change: transform; }
    .dot-cursor.on { opacity: 1; }
    .dot-cursor i { display: block; width: 100%; height: 100%; border-radius: 50%; background: rgba(70, 66, 74, 0.32);
      transform: scale(${DOT.scale['']}); transition: transform 0.22s cubic-bezier(0.3, 1.4, 0.5, 1), background 0.2s; }
    .dot-cursor.pointer i, .dot-cursor.grab i { background: rgba(70, 66, 74, 0.2); }
    .dot-cursor.grabbing i { background: rgba(70, 66, 74, 0.42); }`;
  document.head.appendChild(style);
  const el = document.createElement('div'), dot = document.createElement('i');
  el.className = 'dot-cursor'; el.appendChild(dot); document.body.appendChild(el);

  // in the panel: what counts as something to click or drag
  const ACTIVE = 'button, input, select, textarea, a, label, .lil-gui .title, .lil-gui .slider, .lil-gui .widget';
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, seen = false, down = false, state = null, over = canvas;
  const restyle = () => {
    const s = over === canvas || canvas.hasPointerCapture?.(1) ? canvas.style.cursor || '' : over?.closest?.(ACTIVE) ? 'pointer' : '';
    if (s !== state) { el.classList.remove('pointer', 'grab', 'grabbing'); if (s) el.classList.add(s); state = s; }
    dot.style.transform = `scale(${(DOT.scale[s] ?? DOT.scale['']) * (down ? DOT.press : 1)})`;
  };
  new MutationObserver(restyle).observe(canvas, { attributes: true, attributeFilter: ['style'] });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') { el.classList.remove('on'); return; }
    tx = e.clientX; ty = e.clientY;
    if (!seen) { x = tx; y = ty; seen = true; }
    el.classList.add('on');
    if (e.target !== over) { over = e.target; restyle(); }
  });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { down = true; restyle(); } });
  addEventListener('pointerup', () => { down = false; restyle(); });
  document.documentElement.addEventListener('mouseleave', () => el.classList.remove('on'));
  addEventListener('blur', () => el.classList.remove('on'));
  restyle();
  (function glide() {
    x += (tx - x) * DOT.follow; y += (ty - y) * DOT.follow;
    el.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(glide);
  })();
}
