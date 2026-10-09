// Shared timing helpers for the AI For You videos. Every frame is a pure function of t (seconds).
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const outExpo = x => x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
const outBack = x => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const inOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const lerp = (a, b, x) => a + (b - a) * x;

function rise(el, t, a, d = 0.6, dist = 40) {
  const p = outExpo(prog(t, a, a + d));
  el.style.opacity = p; el.style.transform = `translateY(${(1 - p) * dist}px)`;
  return p;
}
// masked line reveal: text slides up from under its own baseline
function wipe(el, t, a, d = 0.55) {
  const p = outExpo(prog(t, a, a + d));
  el.style.transform = `translateY(${(1 - p) * 105}%)`;
}
// the site's reply transition: blur in from below
function blurIn(el, t, a, d = 0.4) {
  const p = outExpo(prog(t, a, a + d));
  el.style.opacity = p; el.style.transform = `translateY(${(1 - p) * 8}px)`; el.style.filter = `blur(${(1 - p) * 5}px)`;
}
function stamp(el, t, a, rot = -4) {
  const p = prog(t, a, a + 0.3);
  el.style.opacity = p > 0 ? 1 : 0;
  el.style.transform = `rotate(${rot}deg) scale(${p > 0 ? lerp(1.5, 1, outBack(p)) : 1.5})`;
}
function typeTo(el, text, t, a, b) {
  el.textContent = text.slice(0, Math.round(text.length * prog(t, a, b)));
}
// a scene is visible in [a, b) and lifts away in its last 0.25s unless it is the last one
function scene(el, t, a, b, exit = true) {
  const on = t >= a && t < b;
  el.style.visibility = on ? "visible" : "hidden";
  const p = exit ? inOut(prog(t, b - 0.25, b)) : 0;
  // a black band keeps its background and only lifts its content, so it never fades to grey
  const band = el.classList.contains("band");
  el.style.opacity = on ? (band ? 1 : 1 - p) : 0;
  for (const target of band ? el.children : [el]) {
    if (band) target.style.opacity = 1 - p;
    target.style.translate = `0 ${-p * 60}px`;
  }
  return on;
}

// End card: logo, two masked headline lines, button + sub line, three action steps, cursor click.
function renderCta(t, a) {
  if (!scene($("cta"), t, a, 99, false)) { $("cursor").style.opacity = 0; return; }
  rise($("ctaLogo"), t, a + 0.05, 0.5, 20);
  wipe($("ctaL1"), t, a + 0.1); wipe($("ctaL2"), t, a + 0.3);
  rise($("ctaRow"), t, a + 0.75, 0.6, 30);
  rise($("ctaSteps"), t, a + 1.05, 0.6, 20);
  const btn = $("ctaBtn"), cur = $("cursor");
  const r = btn.getBoundingClientRect();
  const tx = r.left + r.width * 0.7, ty = r.top + r.height * 0.55;
  const c = a + 1.5;
  const mp = inOut(prog(t, c, c + 0.8));
  cur.style.opacity = prog(t, c, c + 0.15);
  cur.style.left = lerp(1560, tx, mp) + "px";
  cur.style.top = lerp(1010, ty, mp) + "px";
  const press = t >= c + 0.95 && t < c + 1.1, clicked = t >= c + 0.95;
  cur.style.transform = `scale(${press ? 0.85 : 1})`;
  btn.style.transform = press ? "translateY(3px)" : "none";
  btn.style.background = clicked ? "var(--fg)" : "var(--blue)";
  btn.style.borderColor = clicked ? "var(--fg)" : "var(--blue)";
}

window.ready = (async () => {
  await document.fonts.ready;
  await Promise.all(['900 100px Archivo', '600 30px Geist', '500 30px Geist', '400 20px "Geist Mono"'].map(f => document.fonts.load(f)));
  window.render(0); return true;
})();
