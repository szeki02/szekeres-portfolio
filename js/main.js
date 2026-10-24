import { createHero } from './hero.js';
import { createLifecycle } from './lifecycle.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('js');

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isDesktop = () => window.innerWidth > 820;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ------------------------------------------------------------------ */
/* smooth scroll                                                       */
/* ------------------------------------------------------------------ */
const lenis = new Lenis({ lerp: reduced ? 1 : 0.095, smoothWheel: !reduced, wheelMultiplier: 0.95 });
lenis.stop();
window.lenis = lenis;
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  // "Work" lands on the hero where the cube has come apart into the index
  const target = id === '#top' ? 0
    : id === '#work' && heroPin ? heroPin.start + (heroPin.end - heroPin.start) * (HERO_SPLIT + 0.2)
    : $(id);
  if (target === null) return;
  e.preventDefault();
  document.body.classList.remove('menu-open');
  // lazy images and the life-cycle model grow the page mid-flight on long jumps,
  // so settle onto the section once the first glide ends
  let tries = 0;
  const go = (duration) => lenis.scrollTo(target, {
    duration, easing: (x) => 1 - Math.pow(1 - x, 4),
    onComplete: () => { if (target instanceof Element && Math.abs(target.getBoundingClientRect().top) > 4 && tries++ < 3) go(0.9); },
  });
  go(1.8);
});

/* ------------------------------------------------------------------ */
/* WebGL hero                                                          */
/* ------------------------------------------------------------------ */
let hero = null;
try { hero = createHero($('#gl')); }
catch (err) { console.warn('WebGL unavailable', err); $('#gl').style.display = 'none'; }

/* ------------------------------------------------------------------ */
/* text splitting                                                      */
/* ------------------------------------------------------------------ */
function splitChars(el) {
  const frag = document.createDocumentFragment();
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === 3) {
      node.textContent.split(/(\s+)/).forEach((word) => {
        if (!word) return;
        if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span');
        w.style.whiteSpace = 'nowrap';
        w.style.display = 'inline-block';
        [...word].forEach((ch) => {
          const wrap = document.createElement('span');
          wrap.className = 'char-wrap';
          const c = document.createElement('span');
          c.className = 'split-char';
          c.textContent = ch;
          wrap.appendChild(c);
          w.appendChild(wrap);
        });
        frag.appendChild(w);
      });
    } else if (node.nodeName === 'BR') {
      frag.appendChild(node.cloneNode());
    } else {
      const wrap = document.createElement('span');
      wrap.className = 'char-wrap';
      const c = document.createElement('span');
      c.className = 'split-char';
      c.appendChild(node.cloneNode(true));
      wrap.appendChild(c);
      frag.appendChild(wrap);
    }
  });
  el.innerHTML = '';
  el.appendChild(frag);
  return $$('.split-char', el);
}

function splitWords(el, cls = 'split-word', wrapIt = true) {
  const html = [];
  [...el.childNodes].forEach((node) => {
    if (node.nodeName === 'BR') { html.push('<br>'); return; }
    const text = node.textContent;
    text.split(/(\s+)/).forEach((w) => {
      if (!w) return;
      if (/^\s+$/.test(w)) html.push(' ');
      else html.push(wrapIt ? `<span class="char-wrap"><span class="${cls}">${w}</span></span>` : `<span class="${cls}">${w}</span>`);
    });
  });
  el.innerHTML = html.join('');
  return $$('.' + cls, el);
}

function splitLines(el) {
  const words = splitWords(el, 'lw', false);
  const lines = [];
  let top = null;
  words.forEach((w) => {
    const t = w.offsetTop;
    if (top === null || Math.abs(t - top) > 4) { lines.push([]); top = t; }
    lines[lines.length - 1].push(w.textContent);
  });
  el.innerHTML = lines.map((l) => `<span class="split-line"><span>${l.join(' ')}</span></span>`).join('');
  return $$('.split-line > span', el);
}

/* ------------------------------------------------------------------ */
/* scramble text (HUD)                                                 */
/* ------------------------------------------------------------------ */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_-';
function scramble(el, text, frames = 26) {
  if (!el || el.dataset.target === text) return;
  el.dataset.target = text;
  cancelAnimationFrame(el._raf);
  let f = 0;
  const len = Math.max(text.length, el.textContent.length);
  const step = () => {
    let out = '';
    const shown = (f / frames) * len;
    for (let i = 0; i < len; i++) {
      const ch = text[i] ?? '';
      out += i < shown ? ch : (ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]);
    }
    el.textContent = out;
    if (f++ < frames) el._raf = requestAnimationFrame(step);
    else el.textContent = text;
  };
  step();
}

/* ------------------------------------------------------------------ */
/* loader + intro                                                      */
/* ------------------------------------------------------------------ */
// only what the first two screens need; the rest lazy-loads
const preload = ['assets/img/portrait.jpg', 'assets/img/cam-pavilion.jpg'];
function runLoader() {
  const num = $('.loader__num');
  const bar = $('.loader__bar span');
  const status = $('.loader__status');
  const prog = { v: 0 };
  let loaded = 0;
  const total = preload.length + 1;
  const statuses = ['LOADING MODULES', 'CARVING VOIDS', 'POURING CONCRETE', 'RIGGING GANTRIES', 'READY'];
  const target = { v: 0 };
  const bump = () => { loaded++; target.v = loaded / total; };
  preload.forEach((src) => { const i = new Image(); i.onload = i.onerror = bump; i.src = src; });
  document.fonts.ready.then(bump);

  return new Promise((resolve) => {
    const minTime = reduced ? 0 : 1.5;
    const start = performance.now();
    let last = start;
    const tick = () => {
      const now = performance.now();
      const elapsed = (now - start) / 1000;
      const dt = (now - last) / 1000;
      last = now;
      const cap = Math.min(1, elapsed / minTime || 1);
      // frame-rate independent easing toward the loaded fraction
      prog.v += (Math.min(target.v, cap) - prog.v) * (1 - Math.exp(-dt * 9));
      if (Math.min(target.v, cap) - prog.v < 0.004) prog.v = Math.min(target.v, cap);
      const p = Math.round(prog.v * 100);
      num.textContent = String(p).padStart(3, '0');
      bar.style.transform = `scaleX(${prog.v})`;
      status.textContent = statuses[Math.min(statuses.length - 1, Math.floor(prog.v * (statuses.length - 1) + 0.01))];
      if (prog.v > 0.995 && target.v >= 1) { num.textContent = '100'; resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
    // safety: never trap the visitor behind the loader
    setTimeout(() => { target.v = 1; }, 6000);
  });
}

function intro() {
  const heroChars = $$('[data-hero-split]').map(splitChars).flat();
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.to('.loader__center', { opacity: 0, y: -20, duration: 0.4, ease: 'power2.in' })
    .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.05')
    .set('.loader', { display: 'none' })
    .add(() => {
      document.body.classList.remove('is-loading');
      window.scrollTo(0, 0);
      lenis.scrollTo(0, { immediate: true, force: true });
      lenis.start();
      ScrollTrigger.refresh();
    }, '-=0.6');
  if (hero) tl.to(hero.intro, { v: 1, duration: 2.6, ease: 'expo.out' }, '-=1.0');
  tl.from(heroChars, { yPercent: 115, duration: 1.4, stagger: 0.03 }, '-=2.4')
    .from('.hero__role, .hero__brief, .hero__contact, .hero__hint', { opacity: 0, y: 20, duration: 1, stagger: 0.08 }, '-=1.2')
    .from('.hero__vertical, .hero__years', { opacity: 0, x: 30, duration: 1.2, stagger: 0.1 }, '<')
    .from('.hero__ticks li', { scaleX: 0, transformOrigin: 'right', duration: 0.8, stagger: 0.04 }, '<')
    .from('.hero .mark', { scale: 0, rotate: 90, duration: 1, stagger: 0.06 }, '<')
    .from('.hud', { opacity: 0, duration: 1 }, '<');
}

/* ------------------------------------------------------------------ */
/* cursor                                                              */
/* ------------------------------------------------------------------ */
function initCursor() {
  if (!finePointer) return;
  const cur = $('.cursor');
  const label = $('.cursor__label');
  const dotX = gsap.quickSetter('.cursor__dot', 'x', 'px');
  const dotY = gsap.quickSetter('.cursor__dot', 'y', 'px');
  const ringX = gsap.quickTo('.cursor__ring', 'x', { duration: 0.45, ease: 'power3' });
  const ringY = gsap.quickTo('.cursor__ring', 'y', { duration: 0.45, ease: 'power3' });
  const labels = { view: 'VIEW', drag: 'DRAG', zoom: 'ZOOM', copy: 'COPY', scrub: 'MOVE', top: 'UP ↑' };
  let px = -100, py = -100;
  const evaluate = (t) => {
    const lensEl = t && t.closest('.lens');
    const c = t && t.closest('[data-cursor]');
    let txt = '';
    if (lensEl) txt = '';
    else if (c) txt = labels[c.dataset.cursor] || '';
    else if (document.body.classList.contains('cube-hover')) txt = 'CLICK';
    else if (document.body.classList.contains('cube-menu-hover')) txt = 'OPEN';
    if (txt) { label.textContent = txt; cur.classList.add('has-label'); } else cur.classList.remove('has-label');
    cur.classList.toggle('is-hover', !txt && !!(t && t.closest('a, button, summary')));
    cur.classList.toggle('is-hidden', !!lensEl && lensEl.classList.contains('is-on'));
  };
  window.addEventListener('pointermove', (e) => {
    px = e.clientX; py = e.clientY;
    dotX(px); dotY(py); ringX(px); ringY(py);
    evaluate(e.target.closest ? e.target : null);
  }, { passive: true });
  // content moves under a still pointer while scrolling
  lenis.on('scroll', () => evaluate(document.elementFromPoint(px, py)));
  window.addEventListener('pointerdown', () => cur.classList.add('is-down'));
  window.addEventListener('pointerup', () => cur.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => cur.classList.add('is-hidden'));
  document.addEventListener('pointerenter', () => cur.classList.remove('is-hidden'));
}

function initMagnetic() {
  if (!finePointer) return;
  $$('.magnetic').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.3);
      yTo((e.clientY - r.top - r.height / 2) * 0.4);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
function initHud() {
  const num = $('.hud__chapter-num');
  const name = $('.hud__chapter-name');
  const coords = $('.hud__coords-val');
  $$('[data-chapter]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 50%', end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return;
        scramble(num, sec.dataset.chapter);
        scramble(name, sec.dataset.name);
        scramble(coords, sec.dataset.coords);
      },
    });
  });
  const fill = $('.hud__progress-fill');
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => { fill.style.transform = `scaleX(${s.progress})`; } });

  const clocks = $$('.clock');
  const fmt = (tz) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const update = () => clocks.forEach((c) => { c.textContent = fmt(c.dataset.tz).format(new Date()); });
  update(); setInterval(update, 15000);

  $('.hud__menu').addEventListener('click', () => document.body.classList.toggle('menu-open'));
}

/* ------------------------------------------------------------------ */
/* hero scroll + canvas lifecycle                                      */
/* ------------------------------------------------------------------ */
const HERO_SPLIT = 0.5;   // share of the hero pin spent disassembling; the rest holds the menu
let heroPin = null;

function initHeroScroll() {
  const canvas = $('#gl');
  const heroSt = { a: true, c: false };
  const prog = { hero: 0, cover: 0, contact: 0 };
  const sync = () => {
    const on = heroSt.a || heroSt.c;
    if (hero) hero.setRunning(on);
    canvas.style.visibility = on ? 'visible' : 'hidden';
  };
  // pinned hero: the cube disassembles along its designed stack while the page holds still,
  // the loose pieces then hold as the project menu, then About slides over it; the cube
  // reassembles as the contact section arrives
  const smooth = gsap.utils.clamp(0, 1);
  const explode = () => {
    if (!hero) return;
    const inContact = prog.contact > 0;
    hero.setExplode(inContact ? 1 - prog.contact : smooth(prog.hero / HERO_SPLIT));
    // keep the modules centred in whatever slice of the canvas is still uncovered
    hero.setShift(inContact ? -(1 - prog.contact) : prog.cover);
    const menuIn = smooth((prog.hero - HERO_SPLIT * 0.85) / 0.12) * (1 - smooth(prog.cover / 0.22));
    hero.setMenuOn(inContact ? 0 : menuIn);
  };
  heroPin = ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: '+=230%', pin: true, scrub: true,
    onUpdate: (s) => { prog.hero = s.progress; explode(); },
  });
  ScrollTrigger.create({
    trigger: '.about', start: 'top bottom', end: 'top top', scrub: true,
    onUpdate: (s) => { prog.cover = s.progress; explode(); },
    onLeave: () => { heroSt.a = false; sync(); },
    onEnterBack: () => { heroSt.a = true; sync(); },
  });
  // measured from the page top: with the pinned hero itself as trigger these resolved to after the pin
  gsap.to('.hero__side, .hero__contact, .hero__brief, .hero__hint', { opacity: 0, ease: 'none', scrollTrigger: { start: 0, end: () => window.innerHeight * 0.35, scrub: true, invalidateOnRefresh: true } });
  gsap.to('.hero__name', { opacity: 0.18, ease: 'none', scrollTrigger: { start: 0, end: () => window.innerHeight, scrub: true, invalidateOnRefresh: true } });

  ScrollTrigger.create({
    trigger: '.contact', start: 'top bottom', end: 'top top', scrub: true,
    onUpdate: (s) => { prog.contact = s.progress; explode(); },
    onEnter: () => { heroSt.c = true; sync(); },
    onLeaveBack: () => { heroSt.c = false; sync(); },
  });
}

/* ------------------------------------------------------------------ */
/* generic reveals                                                     */
/* ------------------------------------------------------------------ */
function initReveals() {
  $$('[data-split]').forEach((el) => {
    const type = el.dataset.split;
    if (el.closest('.p-open')) return; // handled by opener timeline
    let targets;
    if (type === 'chars') targets = splitChars(el);
    else if (type === 'words') targets = splitWords(el);
    else targets = splitLines(el);
    gsap.from(targets, {
      yPercent: 110, duration: type === 'lines' ? 1.2 : 1.1, ease: 'expo.out',
      stagger: type === 'chars' ? 0.025 : type === 'words' ? 0.06 : 0.09,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%', once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });

  $$('[data-clip]').forEach((el) => {
    const img = $('img', el);
    gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
    if (img && !img.hasAttribute('data-parallax-img')) {
      gsap.fromTo(img, { scale: 1.3 }, { scale: 1, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    }
  });

  $$('img[data-parallax-img]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -14 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  $$('[data-parallax]').forEach((el) => {
    const s = parseFloat(el.dataset.parallax);
    gsap.fromTo(el, { y: () => -s * window.innerHeight }, { y: () => s * window.innerHeight, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
  });

  $$('[data-scrub-text]').forEach((el) => {
    const words = splitWords(el, 'sw', false);
    gsap.to(words, {
      opacity: 1, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true },
    });
  });

  $$('[data-count]').forEach((el) => {
    const to = +el.dataset.count;
    const o = { v: 0 };
    gsap.to(o, {
      v: to, duration: 2, ease: 'power3.out',
      onUpdate: () => { el.textContent = Math.round(o.v); },
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });
}

/* ------------------------------------------------------------------ */
/* project openers: pinned clip-path expansion                         */
/* ------------------------------------------------------------------ */
function initOpeners() {
  $$('.p-open').forEach((open) => {
    const media = $('.p-open__media', open);
    const img = $('img', media);
    const chars = splitChars($('.p-title', open));
    const tl = gsap.timeline({
      scrollTrigger: { trigger: open, start: 'top top', end: '+=110%', scrub: 0.6, pin: true, anticipatePin: 1 },
    });
    tl.to(media, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut', duration: 1 }, 0)
      .to(img, { scale: 1, ease: 'power2.out', duration: 1.2 }, 0)
      .to($('.p-open__shade', open), { opacity: 1, duration: 0.6 }, 0.45)
      .from(chars, { yPercent: 115, stagger: 0.02, duration: 0.5, ease: 'power3.out' }, 0.5)
      .from($('.p-num', open), { opacity: 0, x: -20, duration: 0.3 }, 0.6)
      .from($('.p-kicker', open), { opacity: 0, y: 20, duration: 0.3 }, 0.75)
      .from($$('.p-meta > div', open), { opacity: 0, y: 24, stagger: 0.05, duration: 0.3 }, 0.8)
      .to({}, { duration: 0.2 });
  });
}

/* ------------------------------------------------------------------ */
/* cube menu: the disassembled hero pieces are the works index         */
/* ------------------------------------------------------------------ */
function initCubeMenu() {
  // the index lives in the page as plain links (top piece: about, then one per project);
  // here each label is tied to a piece of the cube
  const root = $('.cube-menu');
  if (!hero) { root.remove(); return; }
  const els = $$('.cm-item', root);
  els.forEach((el) => el.insertAdjacentHTML('beforeend', `<span class="cm-thumb" style="background-image:url(${el.dataset.preview})"></span>`));
  $('.cube-menu__head', root).insertAdjacentHTML('afterend', `<svg class="cube-menu__leads" aria-hidden="true">${els.map(() => '<polyline/><circle r="2.5"/>').join('')}</svg>`);
  const lines = $$('polyline', root);
  const dots = $$('circle', root);
  // pointing at a label lifts its piece out of the stack
  els.forEach((el, i) => {
    const on = () => hero.focusMenu(i);
    const off = () => hero.focusMenu(-1);
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
  });

  let last = -2, warmed = false;
  hero.setMenu({
    // a clicked piece follows its label's link (smooth-scrolled by the anchor handler)
    onSelect: (i) => { if (els[i]) els[i].click(); },
    onFrame: (anchors, on, hov) => {
      root.style.opacity = on.toFixed(3);
      root.style.visibility = on > 0.01 ? 'visible' : 'hidden';
      root.classList.toggle('is-live', on > 0.5);
      document.body.classList.toggle('cube-menu-open', on > 0.3);
      if (on <= 0.01) return;
      if (!warmed) { warmed = true; els.forEach((el) => { new Image().src = el.dataset.preview; }); }
      if (hov !== last) {
        last = hov;
        [els, lines, dots].forEach((set) => set.forEach((el, i) => el.classList.toggle('is-on', i === hov)));
        root.classList.toggle('has-hover', hov >= 0);
      }
      const W = window.innerWidth, H = window.innerHeight;
      const narrow = W < 760;
      root.classList.toggle('is-narrow', narrow);
      if (narrow) {
        // phones: a compact tag sits on each piece, nudged down where tags would collide
        const box = anchors.map((a, i) => {
          const w = els[i].offsetWidth, h = els[i].offsetHeight;
          return { i, w, h, x: Math.max(8, Math.min(W - 8 - w, a.x - w / 2)), y: a.y - h / 2 };
        }).sort((p, q) => p.y - q.y);
        box.forEach((b, k) => {
          for (let pass = 0; pass < 2; pass++) {
            for (let j = 0; j < k; j++) {
              const o = box[j];
              if (b.x < o.x + o.w + 6 && o.x < b.x + b.w + 6 && b.y < o.y + o.h + 4) b.y = o.y + o.h + 4;
            }
          }
          els[b.i].style.transform = `translate(${b.x}px, ${b.y}px)`;
        });
        return;
      }
      // desktop: callouts in two columns either side of the stack, leaders back to each piece
      const xs = anchors.map((a) => a.x).sort((p, q) => p - q);
      const n = xs.length;
      const mid = (xs[(n - 1) >> 1] + xs[n >> 1]) / 2;
      const reach = Math.min(W, H) * 0.09 + 30;
      const col = { [-1]: xs[0] - reach, 1: xs[n - 1] + reach };
      const side = anchors.map((a) => (a.x < mid ? -1 : 1));
      // pull a column in when its widest label would run off the screen edge
      const widest = (s) => Math.max(0, ...els.filter((_, i) => side[i] === s).map((el) => el.offsetWidth));
      col[1] = Math.min(col[1], W - 24 - widest(1));
      col[-1] = Math.max(col[-1], 24 + widest(-1));
      const ly = anchors.map((a) => a.y);
      [-1, 1].forEach((s) => {
        const idx = anchors.map((_, i) => i).filter((i) => side[i] === s).sort((p, q) => ly[p] - ly[q]);
        for (let k = 1; k < idx.length; k++) ly[idx[k]] = Math.max(ly[idx[k]], ly[idx[k - 1]] + 54);
      });
      anchors.forEach((a, i) => {
        const s = side[i], cx = col[s];
        els[i].classList.toggle('is-left', s < 0);
        els[i].classList.toggle('is-low', ly[i] > H * 0.55);
        els[i].style.transform = `translate(${cx}px, ${ly[i]}px) translate(${s < 0 ? -100 : 0}%, -50%)`;
        lines[i].setAttribute('points', `${a.x},${a.y} ${cx - s * 30},${ly[i]} ${cx - s * 8},${ly[i]}`);
        dots[i].setAttribute('cx', a.x);
        dots[i].setAttribute('cy', a.y);
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* magnifier lens on drawings                                          */
/* ------------------------------------------------------------------ */
function initLens() {
  if (!finePointer) return;
  $$('.lens').forEach((fig) => {
    const zoom = parseFloat(fig.dataset.zoom || 2.4);
    const glass = document.createElement('div');
    glass.className = 'lens__glass';
    fig.appendChild(glass);
    const R = 110;
    let src = '';
    fig.addEventListener('pointermove', (e) => {
      // the newest picture (the programme viewer stacks a fresh one on each switch)
      const imgs = $$('img', fig);
      const img = imgs[imgs.length - 1];
      if (!img || !img.naturalWidth) return;
      const s = img.currentSrc || img.src;
      if (s !== src) { src = s; glass.style.backgroundImage = `url(${s})`; }
      // renders sit cropped (object-fit: cover) in a masked frame: map the pointer onto the
      // picture as drawn, and only magnify inside the part that is actually visible
      const ir = img.getBoundingClientRect();
      const vr = (img.closest('.img-mask, .program__view') || img).getBoundingClientRect();
      const fr = fig.getBoundingClientRect();
      const inside = e.clientX >= vr.left && e.clientX <= vr.right && e.clientY >= vr.top && e.clientY <= vr.bottom;
      fig.classList.toggle('is-on', inside);
      if (!inside) return;
      const k = getComputedStyle(img).objectFit === 'cover' ? Math.max(ir.width / img.naturalWidth, ir.height / img.naturalHeight) : 0;
      const cw = k ? img.naturalWidth * k : ir.width, ch = k ? img.naturalHeight * k : ir.height;
      const x = e.clientX - ir.left - (ir.width - cw) / 2, y = e.clientY - ir.top - (ir.height - ch) / 2;
      glass.style.left = `${e.clientX - fr.left - R}px`;
      glass.style.top = `${e.clientY - fr.top - R}px`;
      glass.style.backgroundSize = `${cw * zoom}px ${ch * zoom}px`;
      glass.style.backgroundPosition = `${-(x * zoom - R)}px ${-(y * zoom - R)}px`;
    });
    fig.addEventListener('pointerleave', () => fig.classList.remove('is-on'));
  });
}

/* ------------------------------------------------------------------ */
/* drag rails (pavilion drawings, development sketches)                */
/* ------------------------------------------------------------------ */
function initRails() {
  $$('.rail').forEach((rail) => {
    // mouse drags with inertia; touch keeps native swiping. The pointer is only captured once it
    // has really moved, so a plain click still reaches the image (and opens it).
    let down = false, dragging = false, sx = 0, sl = 0, v = 0, lx = 0, raf, pid = 0;
    rail.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; dragging = false; sx = lx = e.clientX; sl = rail.scrollLeft; v = 0; pid = e.pointerId;
      cancelAnimationFrame(raf);
    });
    rail.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!dragging && Math.abs(e.clientX - sx) > 6) { dragging = true; rail.setPointerCapture(pid); rail.classList.add('is-dragging'); }
      if (!dragging) return;
      rail.scrollLeft = sl - (e.clientX - sx);
      v = e.clientX - lx; lx = e.clientX;
    });
    const end = () => {
      if (!down) return;
      down = false;
      if (!dragging) return;
      const glide = () => {
        rail.scrollLeft -= v; v *= 0.94;
        if (Math.abs(v) > 0.4) raf = requestAnimationFrame(glide);
        else rail.classList.remove('is-dragging');
      };
      glide();
    };
    rail.addEventListener('pointerup', end);
    rail.addEventListener('pointercancel', end);
    rail.addEventListener('dragstart', (e) => e.preventDefault());

    // arrow buttons step by roughly one card
    const wrap = rail.closest('.rail-wrap');
    $$('.rail-btn', wrap || document.createElement('div')).forEach((b) => b.addEventListener('click', () => {
      const item = $('.rail__item', rail);
      const step = item ? item.getBoundingClientRect().width + 22 : rail.clientWidth * 0.6;
      rail.scrollBy({ left: step * +b.dataset.dir, behavior: 'smooth' });
    }));

    gsap.from($$('.rail__item', rail), { x: 160, opacity: 0, stagger: 0.08, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: rail, start: 'top 85%', once: true } });
  });
}

// stacked image sequences swap instantly, so fetch their hidden frames before they arrive
function warm(imgs, trigger) {
  ScrollTrigger.create({ trigger, start: 'top 250%', once: true, onEnter: () => imgs.forEach((i) => { i.loading = 'eager'; }) });
}

/* ------------------------------------------------------------------ */
/* terrain stepper (Cameroon)                                          */
/* ------------------------------------------------------------------ */
function initStepper() {
  $$('[data-stepper]').forEach((sec) => {
    const imgs = $$('.stepper__stage img', sec);
    const items = $$('.stepper__list li', sec);
    const idxEl = $('.stepper__idx', sec);
    warm(imgs, sec);
    let cur = -1;
    const set = (i) => {
      if (i === cur) return;
      cur = i;
      imgs.forEach((im, k) => im.classList.toggle('is-active', k === i));
      items.forEach((li, k) => li.classList.toggle('is-active', k === i));
      idxEl.textContent = String(i + 1).padStart(2, '0');
    };
    set(0);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 821px)', () => {
      ScrollTrigger.create({
        trigger: sec, pin: $('.stepper__pin', sec), start: 'top top', end: '+=240%', scrub: true,
        onUpdate: (s) => set(Math.min(imgs.length - 1, Math.floor(s.progress * imgs.length))),
      });
    });
    mm.add('(max-width: 820px)', () => {
      let timer;
      const st = ScrollTrigger.create({
        trigger: sec, start: 'top 70%', end: 'bottom 30%',
        onToggle: (s) => { clearInterval(timer); if (s.isActive) timer = setInterval(() => set((cur + 1) % imgs.length), 2200); },
      });
      items.forEach((li, k) => li.addEventListener('click', () => set(k)));
      return () => { clearInterval(timer); st.kill(); };
    });
  });
}

/* ------------------------------------------------------------------ */
/* horizontal pinned process (Garden)                                  */
/* ------------------------------------------------------------------ */
function initHScroll() {
  $$('[data-hscroll]').forEach((sec) => {
    const track = $('.hscroll__track', sec);
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    warm($$('img', track), sec);
    const tween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: sec, pin: $('.hscroll__pin', sec), start: 'top top', end: () => '+=' + dist() * 1.4, scrub: 0.8, invalidateOnRefresh: true },
    });
    $$('.hcard', sec).forEach((card) => {
      gsap.fromTo($('img', card), { xPercent: -8 }, {
        xPercent: 8, ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
      });
      gsap.from($('figcaption', card), {
        opacity: 0, y: 30, duration: 1, ease: 'expo.out',
        scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 85%', once: true },
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/* circular life cycle (Design Studio IV)                              */
/* ------------------------------------------------------------------ */
// The Rhino progress models run on one timeline u ∈ [0, 4]; page scroll and the bar both drive it.
function initCycle() {
  const sec = $('[data-cycle]');
  if (!sec) return;
  const view = $('.lc-view', sec);
  const canvas = $('.lc-canvas', sec);
  const titleNum = $('.lc-title__num', sec);
  const titleName = $('.lc-title__name', sec);
  const bar = $('.lc-bar', sec);
  const rail = $('.lc-bar__rail', sec);
  const fill = $('.lc-bar__fill', sec);
  const decay = $('.lc-bar__decay span', sec);
  const handle = $('.lc-bar__handle', sec);
  const read = $('.lc-bar__read', sec);
  const stops = $$('.lc-bar__stops button', sec);
  const labelsEl = $('.lc-labels', sec);
  const NAMES = ['Preexistence', 'Demolition', 'Rehabilitation', 'New structure', 'Decay'];

  let lc = null, u = 0, stage = -1, labelEls = [];
  const setU = (v) => {
    u = Math.max(0, Math.min(4, v));
    if (lc) lc.setTime(u);
    const pct = (u / 4) * 100;
    fill.style.width = pct + '%';
    handle.style.left = pct + '%';
    // the readout slides from left-aligned to right-aligned so it never leaves the bar
    read.style.transform = `translateX(calc(${-pct}% - ${(11 * (50 - pct)) / 50}px))`;
    const dil = Math.max(0, Math.min(1, u - 3));
    decay.style.width = dil * 100 + '%';
    const s = Math.min(4, Math.round(u));
    // the decay opens with the flood (lifecycle.js FLOOD), then the structure gives way
    if (u > 3.02 && u < 3.38) read.textContent = 'FLOODING';
    else if (u >= 3.38 && u < 3.98) read.textContent = `DILAPIDATION ${Math.round(Math.min(1, (u - 3.38) / 0.6) * 100)}%`;
    else read.textContent = NAMES[s].toUpperCase();
    bar.setAttribute('aria-valuenow', Math.round(pct));
    bar.setAttribute('aria-valuetext', read.textContent.toLowerCase());
    if (s !== stage) {
      stage = s;
      titleNum.textContent = String(s + 1).padStart(2, '0');
      titleName.textContent = NAMES[s];
      stops.forEach((b, k) => b.classList.toggle('is-active', k === s));
    }
  };
  setU(0);

  // scroll length per transition: the new structure takes longer, so its small parts can be seen falling into place,
  // and so does the decay, which holds a flood before the collapse
  const LEG = [1, 1, 1.9, 1.5];
  const LEG_SUM = LEG.reduce((a, b) => a + b, 0);
  const uOf = (p) => {
    let acc = 0;
    for (let k = 0; k < 4; k++) {
      const w = LEG[k] / LEG_SUM;
      if (p <= acc + w || k === 3) return k + Math.min(1, Math.max(0, (p - acc) / w));
      acc += w;
    }
    return 4;
  };
  const pOf = (v) => {
    const k = Math.min(3, Math.floor(v));
    return (LEG.slice(0, k).reduce((a, b) => a + b, 0) + LEG[k] * (v - k)) / LEG_SUM;
  };
  // the page holds while the five stages play out
  const st = ScrollTrigger.create({
    trigger: sec, pin: $('.cycle__pin', sec), start: 'top top', end: '+=' + Math.round(112 * LEG_SUM) + '%', scrub: true,
    onUpdate: (s) => setU(uOf(s.progress)),
  });
  // render only while any of it is on screen
  ScrollTrigger.create({
    trigger: sec, start: 'top bottom', end: 'bottom top',
    onToggle: (s) => { if (lc) lc.setActive(s.isActive); },
  });
  // load the 6 MB of geometry only when the section approaches
  ScrollTrigger.create({
    trigger: sec, start: 'top 300%', once: true,
    onEnter: () => {
      try { lc = createLifecycle(canvas, { mobile: !isDesktop() }); window.lifecycle = lc; }
      catch (err) { console.warn('life cycle viewer unavailable', err); return; }
      lc.ready.then(({ anchors }) => {
        view.classList.add('is-ready');
        labelEls = anchors.map((a) => {
          const el = document.createElement('div');
          el.className = 'lc-label';
          el.innerHTML = `<span>${a.text}</span>`;
          labelsEl.appendChild(el);
          return el;
        });
        const MIN_GAP = isDesktop() ? 150 : 118;
        lc.onFrame((t, list) => {
          const on = [];
          list.forEach((a, i) => {
            const vis = !a.behind && Math.abs(t - a.stage) < 0.3;
            labelEls[i].classList.toggle('is-on', vis);
            if (vis) on.push({ i, x: a.x, y: a.y });
            else labelEls[i].style.transform = `translate(${a.x}px, ${a.y}px)`;
          });
          // nudge labels of the same stage apart so circles and text never overlap
          for (let it = 0; it < 8; it++) {
            for (let p = 0; p < on.length; p++) for (let q = p + 1; q < on.length; q++) {
              const A = on[p], B = on[q];
              let dx = B.x - A.x, dy = B.y - A.y;
              const dist = Math.hypot(dx, dy);
              if (dist >= MIN_GAP) continue;
              if (dist < 0.01) { dx = 0; dy = 1; } else { dx /= dist; dy /= dist; }
              const push = (MIN_GAP - dist) / 2;
              A.x -= dx * push; A.y -= dy * push;
              B.x += dx * push; B.y += dy * push;
            }
          }
          // keep circle and text inside the view
          const W = labelsEl.clientWidth, H = labelsEl.clientHeight, mx = isDesktop() ? 90 : 64;
          on.forEach((o) => {
            o.x = Math.max(mx, Math.min(W - mx, o.x));
            o.y = Math.max(40, Math.min(H - 60, o.y));
            labelEls[o.i].style.transform = `translate(${o.x}px, ${o.y}px)`;
          });
        });
        lc.setTime(u);
        const r = sec.getBoundingClientRect();
        lc.setActive(r.top < window.innerHeight && r.bottom > 0);
      }).catch((err) => console.warn('life cycle models failed to load', err));
    },
  });

  // dragging the bar scrubs the timeline (and the page with it)
  const scrollToU = (v, smooth) => {
    const y = st.start + pOf(Math.max(0, Math.min(4, v))) * (st.end - st.start);
    lenis.scrollTo(y, smooth ? { duration: 1.2 } : { immediate: true, force: true });
  };
  const fromPointer = (e) => {
    const r = rail.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 4;
  };
  let dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    scrollToU(fromPointer(e), false);
  });
  bar.addEventListener('pointermove', (e) => { if (dragging) scrollToU(fromPointer(e), false); });
  const stop = () => { dragging = false; };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);
  bar.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25 }[e.key];
    if (step) { e.preventDefault(); scrollToU(u + step, true); }
    if (e.key === 'Home') { e.preventDefault(); scrollToU(0, true); }
    if (e.key === 'End') { e.preventDefault(); scrollToU(4, true); }
  });
  stops.forEach((b) => b.addEventListener('click', () => scrollToU(+b.dataset.stage, true)));
}

/* ------------------------------------------------------------------ */
/* programme list (Design Studio IV)                                   */
/* ------------------------------------------------------------------ */
function initProgram() {
  $$('.program').forEach((sec) => {
    const view = $('.program__view', sec);
    const btns = $$('.prog', sec);
    const show = (b) => {
      if (b.classList.contains('is-active')) return;
      btns.forEach((x) => x.classList.toggle('is-active', x === b));
      const img = document.createElement('img');
      img.src = b.dataset.img;
      img.alt = b.querySelector('.prog__t').textContent;
      Object.assign(img.style, { position: 'absolute', inset: '0' });
      view.appendChild(img);
      gsap.fromTo(img, { clipPath: 'inset(100% 0 0 0)', scale: 1.2 }, {
        clipPath: 'inset(0% 0 0 0)', scale: 1, duration: 1.1, ease: 'expo.out',
        onComplete: () => { while (view.children.length > 1) view.removeChild(view.firstChild); },
      });
    };
    btns.forEach((b) => {
      b.addEventListener('click', () => show(b));
      if (finePointer) b.addEventListener('pointerenter', () => show(b));
    });
  });
}

/* ------------------------------------------------------------------ */
/* GRID 808 component library: the panel's own drawings, drawn in      */
/* ------------------------------------------------------------------ */
const UNIT_WIDEST = 520;   // widest drawing on the board, in its pixels: all icons share the panel's scale

// stagger each outline (--o, 0..1) in the direction the unit works in
function orderUnitPaths(svg, mode) {
  const paths = $$('path', svg);
  const c = paths.map((p) => { const b = p.getBBox(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  const mx = c.reduce((s, p) => s + p[0], 0) / c.length;
  const my = c.reduce((s, p) => s + p[1], 0) / c.length;
  let key = (p) => -p[1];                                     // up: from the base
  if (mode === 'out') key = (p) => Math.hypot(p[0] - mx, p[1] - my);
  else if (mode === 'diag') key = (p) => p[0] * 0.4 - p[1];   // heat lifting off the grilles
  else if (mode === 'along') {
    // the connector's long axis (principal direction of its outlines), left to right
    let sxx = 0, syy = 0, sxy = 0;
    c.forEach(([x, y]) => { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); });
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.abs(Math.cos(a)), uy = Math.sin(a) * Math.sign(Math.cos(a) || 1);
    key = (p) => p[0] * ux + p[1] * uy;
  }
  const k = c.map(key);
  const lo = Math.min(...k), hi = Math.max(...k);
  paths.forEach((p, i) => p.style.setProperty('--o', ((k[i] - lo) / (hi - lo || 1)).toFixed(3)));
}

function initUnits() {
  $$('.unit').forEach((card) => {
    const img = $('img.unit__ico', card);
    if (!img) return;
    // inline the drawing so each outline can be animated (the <img> stays if this fails)
    fetch(img.getAttribute('src')).then((r) => r.text()).then((txt) => {
      const svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement;
      if (svg.nodeName !== 'svg') return;
      svg.classList.add('unit__ico');
      svg.dataset.build = img.dataset.build;
      svg.setAttribute('aria-hidden', 'true');
      img.replaceWith(svg);
      svg.style.setProperty('--w', Math.min(1, svg.viewBox.baseVal.width / UNIT_WIDEST).toFixed(3));
      orderUnitPaths(svg, svg.dataset.build);
    }).catch(() => {});
    // drawn in when first seen; pointing at the card draws it again
    ScrollTrigger.create({ trigger: card, start: 'top 85%', once: true, onEnter: () => card.classList.add('is-drawn') });
    card.addEventListener('pointerenter', () => {
      card.classList.remove('is-drawn');
      void card.offsetWidth;
      card.classList.add('is-drawn');
    });
  });
}

/* ------------------------------------------------------------------ */
/* tilt cards                                                          */
/* ------------------------------------------------------------------ */
function initTilt() {
  if (!finePointer) return;
  $$('.tilt').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.8, ease: 'power3' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.8, ease: 'power3' });
    gsap.set(el, { transformPerspective: 900 });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 16);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 12);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

/* ------------------------------------------------------------------ */
/* marquees — speed reacts to scroll velocity                          */
/* ------------------------------------------------------------------ */
function initMarquees() {
  const items = [];
  $$('[data-marquee]').forEach((m) => {
    const track = $('.marquee__track', m);
    track.innerHTML += track.innerHTML;
    const it = { track, x: 0, speed: parseFloat(m.dataset.speed || 0.8), dir: 1, visible: false, pace: 1, hold: false, fling: 0 };
    items.push(it);
    ScrollTrigger.create({ trigger: m, start: 'top bottom', end: 'bottom top', onToggle: (s) => { it.visible = s.isActive; } });
    // a photo strip that opens in the viewer can also be handled by hand
    if (m.hasAttribute('data-lightbox')) grabMarquee(m, it);
  });
  const contact = $('.contact__marquee-track');
  const ci = { track: contact, x: 0, speed: 1.1, dir: 1, visible: true, pace: 1, hold: false, fling: 0 };
  items.push(ci);
  let vel = 0;
  lenis.on('scroll', (l) => { vel = l.velocity; });
  gsap.ticker.add(() => {
    items.forEach((it) => {
      if (!it.visible) return;
      if (Math.abs(vel) > 0.5) it.dir = vel > 0 ? 1 : -1;
      // the drift eases to a stop while held and picks back up after
      it.pace += ((it.hold ? 0 : 1) - it.pace) * 0.06;
      it.x -= (it.speed + Math.abs(vel) * 0.25) * it.dir * it.pace;
      it.x += it.fling; it.fling *= 0.94;
      if (Math.abs(it.fling) < 0.05) it.fling = 0;
      const half = it.track.scrollWidth / 2;
      while (it.x <= -half) it.x += half;
      while (it.x > 0) it.x -= half;
      it.track.style.transform = `translate3d(${it.x}px,0,0)`;
    });
  });
}

// drag or swipe the strip sideways (with a fling), or scroll it with a sideways wheel / trackpad.
// Hovering parks the drift so a picture can be clicked; the pointer is only captured once it has
// really moved, so a plain click still opens the viewer.
function grabMarquee(m, it) {
  let down = false, dragging = false, moved = false, sx = 0, lx = 0, v = 0, pid = 0;
  const mouse = (e) => e.pointerType === 'mouse';
  m.addEventListener('pointerenter', (e) => { if (mouse(e)) it.hold = true; });
  m.addEventListener('pointerleave', (e) => { if (mouse(e) && !down) it.hold = false; });
  m.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = true; dragging = moved = false; sx = lx = e.clientX; v = 0; pid = e.pointerId;
    it.fling = 0; it.hold = true;
  });
  m.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!dragging) {
      if (Math.abs(e.clientX - sx) < 6) return;
      dragging = moved = true;
      m.setPointerCapture(pid);
      m.classList.add('is-dragging');
      m.dataset.cursor = 'drag';
    }
    const dx = e.clientX - lx; lx = e.clientX;
    it.x += dx;
    v = v * 0.4 + dx * 0.6;
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    if (dragging) { it.fling = v; m.classList.remove('is-dragging'); m.dataset.cursor = 'view'; }
    dragging = false;
    // touch has no hover: the drift resumes once the fling settles
    it.hold = mouse(e) && m.matches(':hover');
  };
  m.addEventListener('pointerup', end);
  m.addEventListener('pointercancel', end);
  m.addEventListener('dragstart', (e) => e.preventDefault());
  // the end of a drag is not a click on a photo
  m.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  m.addEventListener('wheel', (e) => {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
    if (!dx) return;   // vertical wheel keeps scrolling the page
    e.preventDefault(); e.stopPropagation();
    it.x -= dx;
  }, { passive: false });
}

/* ------------------------------------------------------------------ */
/* panorama drag (Helsinki)                                            */
/* ------------------------------------------------------------------ */
function initPano() {
  $$('[data-pano]').forEach((pano) => {
    const track = $('.pano__track', pano);
    let drag = 0, scroll = 0, down = false, lx = 0, v = 0;
    const max = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const apply = () => {
      const x = gsap.utils.clamp(-max(), 0, -scroll * max() * 0.7 + drag);
      track.style.transform = `translate3d(${x}px,0,0)`;
    };
    ScrollTrigger.create({ trigger: pano, start: 'top bottom', end: 'bottom top', onUpdate: (s) => { scroll = s.progress; apply(); } });
    pano.addEventListener('pointerdown', (e) => { down = true; lx = e.clientX; v = 0; pano.setPointerCapture(e.pointerId); });
    pano.addEventListener('pointermove', (e) => {
      if (!down) return;
      v = e.clientX - lx; lx = e.clientX;
      drag = gsap.utils.clamp(-max(), max(), drag + v);
      apply();
    });
    const end = () => {
      down = false;
      const glide = () => { drag = gsap.utils.clamp(-max(), max(), drag + v); v *= 0.93; apply(); if (Math.abs(v) > 0.3) requestAnimationFrame(glide); };
      glide();
    };
    pano.addEventListener('pointerup', end);
    pano.addEventListener('pointercancel', end);
    track.querySelector('img').addEventListener('load', apply);
  });
}

/* ------------------------------------------------------------------ */
/* vector field scrub (Design Studio III)                              */
/* ------------------------------------------------------------------ */
function initField() {
  $$('[data-field]').forEach((stage) => {
    const imgs = $$('img', stage);
    const steps = $$('.field__steps span', stage.parentElement);
    const bar = $('.field__bar span', stage);
    warm(imgs, stage);
    let cur = 0;
    const set = (i) => {
      if (i === cur) return;
      cur = i;
      imgs.forEach((im, k) => im.classList.toggle('is-active', k === i));
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    };
    const fromRatio = (r) => { bar.style.transform = `scaleX(${Math.max(0.02, r)})`; set(Math.min(3, Math.floor(r * 4))); };
    // moving across the model still scrubs it; scrolling always takes over again
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      fromRatio(gsap.utils.clamp(0, 0.999, (e.clientX - r.left) / r.width));
    });
    // the page holds still while the four stages play out, one scroll-length each
    const field = stage.closest('.field');
    ScrollTrigger.create({
      trigger: field,
      pin: true,
      start: () => (field.offsetHeight < window.innerHeight - 140 ? 'center center' : 'top 64px'),
      end: '+=260%',
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (s) => fromRatio(Math.min(0.999, s.progress)),
    });
  });
}

/* ------------------------------------------------------------------ */
/* skills meters                                                       */
/* ------------------------------------------------------------------ */
function initMeters() {
  $$('.meter').forEach((m) => {
    const i = $('i', m);
    const lvl = +m.dataset.level;
    i.innerHTML = '<b></b>'.repeat(5);
    i.setAttribute('aria-label', `${lvl} of 5`);
    const bs = $$('b', i);
    ScrollTrigger.create({
      trigger: m, start: 'top 90%', once: true,
      onEnter: () => bs.forEach((b, k) => { if (k < lvl) setTimeout(() => b.classList.add('on'), 120 + k * 90); }),
    });
  });
}

/* ------------------------------------------------------------------ */
/* experience accordions (animated <details>)                          */
/* ------------------------------------------------------------------ */
function initDetails() {
  $$('.xp').forEach((d) => {
    const sum = $('summary', d);
    const body = $('.xp__body', d);
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      if (d.open) {
        gsap.to(body, { height: 0, duration: 0.6, ease: 'expo.inOut', onComplete: () => { d.open = false; body.style.height = ''; ScrollTrigger.refresh(); } });
      } else {
        d.open = true;
        gsap.fromTo(body, { height: 0 }, { height: 'auto', duration: 0.8, ease: 'expo.out', onComplete: () => ScrollTrigger.refresh() });
        gsap.from($('p', body), { y: 20, opacity: 0, duration: 0.8, ease: 'expo.out' });
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* contact copy                                                        */
/* ------------------------------------------------------------------ */
function initContact() {
  const toast = $('.toast');
  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add('is-on');
    setTimeout(() => toast.classList.remove('is-on'), 2600);
  };
  // mailto: is unreliable in embedded viewers, so copy (or select) the address instead
  $$('[data-copy]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const selectIt = () => {
      const r = document.createRange();
      r.selectNodeContents(a);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      say('EMAIL SELECTED · PRESS CTRL/CMD + C');
    };
    try {
      navigator.clipboard.writeText(a.dataset.copy).then(() => say('EMAIL COPIED TO CLIPBOARD'), selectIt);
    } catch { selectIt(); }
  }));
  gsap.from('.contact__mail', { yPercent: 60, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.contact', start: 'top 40%', once: true } });
}

/* ------------------------------------------------------------------ */
/* phone lightbox: tap an image to study it full screen                */
/* ------------------------------------------------------------------ */
function initLightbox() {
  const touchLike = window.matchMedia('(max-width: 820px), (pointer: coarse)');
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = `
    <div class="lb__stage"><img class="lb__img" alt=""></div>
    <button class="lb__nav lb__nav--prev" type="button" aria-label="Previous image">←</button>
    <button class="lb__nav lb__nav--next" type="button" aria-label="Next image">→</button>
    <div class="lb__bar">
      <span class="lb__count px"></span>
      <button class="lb__close" type="button" aria-label="Close image viewer">✕</button>
    </div>
    <p class="lb__cap"></p>
    <p class="lb__hint px">${touchLike.matches ? 'PINCH TO ZOOM · SWIPE FOR NEXT' : 'SCROLL TO ZOOM · ← → FOR NEXT · ESC TO CLOSE'}</p>`;
  document.body.appendChild(lb);
  const stage = $('.lb__stage', lb);
  const img = $('.lb__img', lb);
  const cap = $('.lb__cap', lb);
  const count = $('.lb__count', lb);

  let group = [], idx = 0;
  // view transform
  let s = 1, tx = 0, ty = 0;
  const apply = (anim) => {
    img.style.transition = anim ? 'transform .3s cubic-bezier(.16,1,.3,1)' : 'none';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  const clampPan = () => {
    const r = stage.getBoundingClientRect();
    const w = img.offsetWidth * s, h = img.offsetHeight * s;
    const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  };
  const reset = () => { s = 1; tx = 0; ty = 0; apply(false); };

  const captionOf = (el) => {
    // loose images in a marked gallery speak for themselves (their alt), not for the whole project
    const fig = el.closest('figure, .card, .sol') || (el.closest('[data-lightbox]') ? null : el.closest('article'));
    const fc = fig && fig.querySelector('figcaption, h4');
    return (fc ? fc.textContent : el.alt || '').trim().replace(/\s+/g, ' ');
  };
  const show = (i) => {
    idx = (i + group.length) % group.length;
    const el = group[idx];
    // a high-resolution scan, where one exists, for studying the detail
    img.src = el.dataset.full || el.currentSrc || el.src;
    img.alt = el.alt || '';
    cap.textContent = captionOf(el);
    count.textContent = group.length > 1 ? `${idx + 1} / ${group.length}` : '';
    lb.classList.toggle('has-nav', group.length > 1);
    reset();
  };
  const open = (el) => {
    // a marked gallery steps through itself; elsewhere the whole project is the set
    const scope = el.closest('[data-lightbox]') || el.closest('.project, section') || document.body;
    group = $$('img', scope).filter(eligible).filter((im, k, arr) => arr.findIndex((o) => o.getAttribute('src') === im.getAttribute('src')) === k);
    show(Math.max(0, group.findIndex((im) => im.getAttribute('src') === el.getAttribute('src'))));
    lb.classList.add('is-open');
    document.body.classList.add('lb-open');
    lenis.stop();
    $('.lb__close', lb).focus({ preventScroll: true });
  };
  const close = () => {
    lb.classList.remove('is-open');
    document.body.classList.remove('lb-open');
    lenis.start();
  };
  const eligible = (im) => im.closest('main') && !im.closest('.lb, .hero') && im.naturalWidth !== 1;

  // a tap, not the end of a drag or scroll, opens the viewer
  let downX = 0, downY = 0;
  document.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; }, true);
  document.addEventListener('click', (e) => {
    if (lb.classList.contains('is-open')) return;
    const card = e.target.closest('[data-lightbox] .rail__item, [data-lightbox] figure');
    const im = e.target.closest('img') || (card && card.querySelector('img'));
    if (!im || !eligible(im) || e.target.closest('a, button')) return;
    // phones open any picture; on desktop only the marked galleries do (drawings keep their lens)
    if (!touchLike.matches && !im.closest('[data-lightbox]')) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return;
    e.preventDefault();
    open(im);
  });

  $('.lb__close', lb).addEventListener('click', close);
  $('.lb__nav--prev', lb).addEventListener('click', () => show(idx - 1));
  $('.lb__nav--next', lb).addEventListener('click', () => show(idx + 1));
  // clicking the dark area around the picture closes it
  stage.addEventListener('click', (e) => {
    const r = img.getBoundingClientRect();
    const onPicture = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!onPicture && s <= 1.01 && Math.hypot(e.clientX - downX, e.clientY - downY) < 8) close();
  });
  // mouse wheel zooms around the pointer
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const ns = Math.max(1, Math.min(6, s * Math.exp(-e.deltaY * 0.0015)));
    const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
    tx = cx - (cx - tx) * (ns / s);
    ty = cy - (cy - ty) * (ns / s);
    s = ns;
    if (s <= 1.001) { tx = 0; ty = 0; }
    clampPan(); apply(false);
  }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  });

  // gestures: pinch, pan, double-tap zoom, swipe to change or close
  const pts = new Map();
  let start = null, lastTap = 0;
  const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const m = mid(); start = { kind: 'pinch', d: m.d, s, tx, ty, x: m.x, y: m.y }; }
    else start = { kind: 'pan', x: e.clientX, y: e.clientY, tx, ty, t: performance.now() };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (start.kind === 'pinch' && pts.size === 2) {
      const m = mid();
      const r = stage.getBoundingClientRect();
      const ns = Math.max(1, Math.min(6, start.s * (m.d / start.d)));
      // keep the point between the fingers under the fingers
      const cx = start.x - r.left - r.width / 2, cy = start.y - r.top - r.height / 2;
      tx = cx - (cx - start.tx) * (ns / start.s) + (m.x - start.x);
      ty = cy - (cy - start.ty) * (ns / start.s) + (m.y - start.y);
      s = ns; clampPan(); apply(false);
    } else if (start.kind === 'pan') {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (s > 1.01) { tx = start.tx + dx; ty = start.ty + dy; clampPan(); }
      else { tx = dx; ty = Math.max(0, dy); }   // preview the swipe
      apply(false);
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!start) return;
    if (start.kind === 'pinch') { if (pts.size < 2) start = null; if (s < 1.05) reset(); return; }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const quick = performance.now() - start.t < 400;
    start = null;
    if (s <= 1.01) {
      if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) && group.length > 1) { show(idx + (dx < 0 ? 1 : -1)); return; }
      tx = 0; ty = 0; apply(true);
    }
    // double tap toggles a 2.5x zoom at the tapped point
    if (quick && Math.hypot(dx, dy) < 8) {
      const now = performance.now();
      if (now - lastTap < 300) {
        const r = stage.getBoundingClientRect();
        if (s > 1.01) reset();
        else {
          const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
          s = 2.5; tx = -cx * 1.5; ty = -cy * 1.5; clampPan();
        }
        apply(true);
        lastTap = 0;
      } else lastTap = now;
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

/* refresh trigger positions as lazy images land */
function initLazyRefresh() {
  let t;
  const refresh = () => { clearTimeout(t); t = setTimeout(() => ScrollTrigger.refresh(), 250); };
  $$('img').forEach((img) => { if (!img.complete) img.addEventListener('load', refresh, { once: true }); });
  window.addEventListener('load', refresh);
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
window.scrollTo(0, 0);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

document.fonts.ready.then(() => {
  initCursor();
  initMagnetic();
  initHud();
  initHeroScroll();
  initOpeners();
  initReveals();
  initCubeMenu();
  initLens();
  initRails();
  initStepper();
  initHScroll();
  initCycle();
  initProgram();
  initTilt();
  initUnits();
  initMarquees();
  initPano();
  initField();
  initMeters();
  initDetails();
  initContact();
  initLightbox();
  initLazyRefresh();
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
});

runLoader().then(intro);
