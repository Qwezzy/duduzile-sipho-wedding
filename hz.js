/* Horizontal variant: turns the column of sheets into a sideways track.
   Vertical wheel moves one card at a time, unless the card under the pointer can still scroll inside.
   Publishes scroll progress (0..1) as window.hzProgress for the 3D scene, and drives the nav progress line and active link. */
(() => {
  const track = document.querySelector(".wrap");
  if (!track) return;
  const panels = [...track.children].filter((el) => el.matches(".sheet, footer"));
  const nav = document.querySelector(".nav");
  const links = [...document.querySelectorAll('.links a[href^="#"]')];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Pager UI */
  const pager = document.createElement("div");
  pager.className = "pager"; pager.setAttribute("aria-label", "Sections");
  pager.innerHTML = '<button type="button" class="prev" aria-label="Previous section">‹</button><div class="dots"></div><button type="button" class="next" aria-label="Next section">›</button>';
  document.body.append(pager);
  const dots = panels.map((p, i) => {
    const d = document.createElement("i");
    d.title = p.getAttribute("aria-label") || (p.querySelector("h2") || {}).textContent || (i ? "Footer" : "Start");
    d.addEventListener("click", () => go(i));
    pager.querySelector(".dots").append(d);
    return d;
  });
  const hint = document.createElement("div");
  hint.className = "hint"; hint.textContent = "SCROLL";
  document.body.append(hint);

  /* Reveal: the page's own reveal watches vertical scrolling, so mark cards as they slide in */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { root: track, threshold: 0.12 });
  panels.forEach((p) => io.observe(p));

  const current = () => {
    const mid = track.scrollLeft + track.clientWidth / 2;
    if (track.scrollLeft < 4) return 0;
    let best = 0, dist = Infinity;
    panels.forEach((p, i) => { const c = p.offsetLeft + p.offsetWidth / 2; const d = Math.abs(c - mid); if (d < dist) { dist = d; best = i; } });
    return best;
  };
  const go = (i) => {
    i = Math.max(0, Math.min(panels.length - 1, i));
    const p = panels[i];
    const left = i === 0 ? 0 : p.offsetLeft + p.offsetWidth / 2 - track.clientWidth / 2;
    track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  };
  pager.querySelector(".prev").addEventListener("click", () => go(current() - 1));
  pager.querySelector(".next").addEventListener("click", () => go(current() + 1));

  /* Nav links and any in-page anchor: slide to the card that holds the target */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    const t = id ? document.getElementById(id) : null;
    const idx = id === "top" ? 0 : panels.findIndex((p) => p === t || (t && p.contains(t)));
    if (idx < 0) return;
    e.preventDefault(); go(idx);
    history.replaceState(null, "", "#" + id);
  });

  /* Wheel: vertical intent becomes one step sideways, unless the card can still scroll that way */
  let lock = 0, acc = 0;
  track.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;          // trackpad sideways swipe: native
    const card = e.target.closest(".sheet, footer");
    if (card && card.scrollHeight > card.clientHeight + 2) {
      const atTop = card.scrollTop <= 0, atEnd = card.scrollTop + card.clientHeight >= card.scrollHeight - 2;
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atEnd)) return;   // let the card scroll first
    }
    e.preventDefault();
    const now = performance.now();
    if (now < lock) return;
    acc += e.deltaY;
    if (Math.abs(acc) < 30) return;
    go(current() + (acc > 0 ? 1 : -1));
    acc = 0; lock = now + 650;
  }, { passive: false });

  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(current() + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(current() - 1); }
    if (e.key === "Home") { e.preventDefault(); go(0); }
    if (e.key === "End") { e.preventDefault(); go(panels.length - 1); }
  });

  /* Progress, active dot and nav link */
  const sync = () => {
    const max = track.scrollWidth - track.clientWidth;
    const p = max > 0 ? track.scrollLeft / max : 0;
    window.hzProgress = p;
    if (nav) { nav.style.setProperty("--p", p.toFixed(4)); nav.classList.toggle("scrolled", p > 0.01); }
    const i = current();
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    pager.querySelector(".prev").disabled = i === 0;
    pager.querySelector(".next").disabled = i === panels.length - 1;
    if (p > 0.02) hint.classList.add("gone");
    const panel = panels[i];
    links.forEach((a) => {
      const t = document.getElementById(a.getAttribute("href").slice(1));
      const on = t && (t === panel || panel.contains(t));
      a.classList.toggle("on", !!on);
      if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
  };
  let tick = false;
  track.addEventListener("scroll", () => { if (tick) return; tick = true; requestAnimationFrame(() => { tick = false; sync(); }); }, { passive: true });
  addEventListener("resize", () => { go(current()); sync(); });

  /* Deep link: open on the card named in the address bar */
  const start = location.hash && document.getElementById(location.hash.slice(1));
  if (start) { const i = panels.findIndex((p) => p === start || p.contains(start)); if (i > 0) requestAnimationFrame(() => { track.style.scrollBehavior = "auto"; go(i); track.style.scrollBehavior = ""; }); }
  sync();
})();
