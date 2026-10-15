/* Motion layer for the wedding site. Progressive enhancement only: the page reads and works
   without it. The inline bootstrap in index.html sets html.mo when the visitor allows motion. */
(() => {
  "use strict";
  const root = document.documentElement;
  if (!root.classList.contains("mo")) return;
  window.__mo = 1;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const nav = $(".nav");
  const hero = $(".hero");
  const sheets = $$(".sheet");
  const revealSheets = sheets.filter((s) => s !== hero);

  /* ---- Opening card: wrap the artwork so it can drift and catch the light ---- */
  let art = null;
  if (hero) {
    const img = $("img", hero);
    if (img) {
      art = document.createElement("div");
      art.className = "hero-art";
      img.parentNode.insertBefore(art, img);
      art.append(img);
      const sheen = document.createElement("span");
      sheen.className = "hero-sheen";
      sheen.setAttribute("aria-hidden", "true");
      art.append(sheen);
    }
  }

  /* ---- Pointer light layer inside each sheet ---- */
  if (fine) {
    revealSheets.forEach((s) => {
      const l = document.createElement("div");
      l.className = "mo-light";
      l.setAttribute("aria-hidden", "true");
      s.prepend(l);
    });
  }

  /* ---- Reveal sheets and the footer as they scroll into view ---- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.01 });
  revealSheets.forEach((s) => io.observe(s));
  const foot = $("footer");
  if (foot) io.observe(foot);

  /* ---- Scroll-driven: progress hairline, nav shadow, hero parallax, corner art, active link ---- */
  const links = $$('.links a[href^="#"]');
  const targets = links.map((a) => { try { return $(a.getAttribute("href")); } catch (_) { return null; } });
  const linkBox = $(".links");
  const artSheets = sheets.filter((s) => s.classList.contains("pr") || s.classList.contains("pl"));
  let active = -2;

  const onScroll = () => {
    const y = window.scrollY, vh = window.innerHeight;
    const max = root.scrollHeight - vh;
    /* read everything first, then write, so each frame costs one layout */
    const hr = hero && art ? hero.getBoundingClientRect() : null;
    const sr = artSheets.map((s) => s.getBoundingClientRect());
    const tops = targets.map((t) => (t ? t.getBoundingClientRect().top : Infinity));
    if (nav) {
      nav.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : "0");
      nav.classList.toggle("scrolled", y > 24);
    }
    if (hr) art.style.setProperty("--hs", clamp(-hr.top / hr.height, 0, 1).toFixed(3));
    artSheets.forEach((s, i) => {
      const r = sr[i];
      if (r.bottom < -150 || r.top > vh + 150) return;
      s.style.setProperty("--sy", clamp((vh - r.top) / (vh + r.height), 0, 1).toFixed(3));
    });
    let idx = -1;
    tops.forEach((t, i) => { if (t <= vh * 0.45) idx = i; });
    if (idx !== active) {
      active = idx;
      links.forEach((a, i) => {
        a.classList.toggle("on", i === idx);
        if (i === idx) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
      if (idx >= 0 && linkBox && linkBox.scrollWidth > linkBox.clientWidth) {
        const a = links[idx];
        const left = a.getBoundingClientRect().left - linkBox.getBoundingClientRect().left + linkBox.scrollLeft - 28;
        linkBox.scrollTo({ left, behavior: "smooth" });
      }
    }
  };
  let scrollTick = false;
  const queueScroll = () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => { scrollTick = false; onScroll(); });
  };
  addEventListener("scroll", queueScroll, { passive: true });
  addEventListener("resize", queueScroll, { passive: true });
  onScroll();

  /* ---- Pointer-driven (mouse and trackpad only): hero drift and shine, paper light, card spotlight, magnetic buttons ---- */
  if (fine) {
    let lit = null, hot = null, heroOn = false, last = null, moveTick = false;
    const resetHero = () => {
      if (!art || !heroOn) return;
      heroOn = false;
      ["--hx", "--hy"].forEach((k) => art.style.setProperty(k, "0"));
      art.style.setProperty("--so", "0");
    };
    const resetBtn = (b) => { b.style.removeProperty("--bx"); b.style.removeProperty("--by"); };
    const resetAll = () => {
      resetHero();
      if (lit) { lit.style.setProperty("--lo", "0"); lit = null; }
      if (hot) { resetBtn(hot); hot = null; }
    };
    const handle = (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const sheet = t && t.closest(".sheet:not(.hero)");
      const card = t && t.closest(".card");
      const btn = t && t.closest(".btn");
      /* reads */
      const ar = art ? art.getBoundingClientRect() : null;
      const sr = sheet ? sheet.getBoundingClientRect() : null;
      const cr = card ? card.getBoundingClientRect() : null;
      const br = btn ? btn.getBoundingClientRect() : null;
      /* writes */
      if (ar) {
        if (e.clientX >= ar.left && e.clientX <= ar.right && e.clientY >= ar.top && e.clientY <= ar.bottom) {
          const nx = (e.clientX - ar.left) / ar.width, ny = (e.clientY - ar.top) / ar.height;
          art.style.setProperty("--hx", ((nx - 0.5) * 2).toFixed(3));
          art.style.setProperty("--hy", ((ny - 0.5) * 2).toFixed(3));
          art.style.setProperty("--gx", (nx * 100).toFixed(1) + "%");
          art.style.setProperty("--gy", (ny * 100).toFixed(1) + "%");
          art.style.setProperty("--so", "1");
          heroOn = true;
        } else resetHero();
      }
      if (lit && lit !== sheet) lit.style.setProperty("--lo", "0");
      if (sheet) {
        sheet.style.setProperty("--lx", (e.clientX - sr.left).toFixed(0) + "px");
        sheet.style.setProperty("--ly", (e.clientY - sr.top).toFixed(0) + "px");
        sheet.style.setProperty("--lo", "1");
      }
      lit = sheet || null;
      if (card) {
        card.style.setProperty("--mx", (e.clientX - cr.left).toFixed(0) + "px");
        card.style.setProperty("--my", (e.clientY - cr.top).toFixed(0) + "px");
      }
      if (hot && hot !== btn) resetBtn(hot);
      if (btn) {
        const dx = (e.clientX - (br.left + br.width / 2)) / br.width;
        const dy = (e.clientY - (br.top + br.height / 2)) / br.height;
        btn.style.setProperty("--bx", clamp(dx * 12, -5, 5).toFixed(1) + "px");
        btn.style.setProperty("--by", clamp(dy * 8, -3, 3).toFixed(1) + "px");
      }
      hot = btn || null;
    };
    addEventListener("pointermove", (e) => {
      last = e;
      if (moveTick) return;
      moveTick = true;
      requestAnimationFrame(() => { moveTick = false; handle(last); });
    }, { passive: true });
    root.addEventListener("pointerleave", resetAll);
    addEventListener("blur", resetAll);
  }

  /* ---- Button ripple (also gives touch screens a response) ---- */
  document.addEventListener("pointerdown", (e) => {
    const b = e.target instanceof Element ? e.target.closest(".btn") : null;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement("span");
    s.className = "rip";
    s.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
    b.append(s);
    s.addEventListener("animationend", () => s.remove());
  }, { passive: true });

  /* ---- Countdown: count up on arrival, then roll the digit when a value changes ---- */
  const cd = ["cd-d", "cd-h", "cd-m"].map((id) => document.getElementById(id)).filter(Boolean);
  if (cd.length) {
    const rows = cd.map((n) => ({ n, v: parseInt(n.textContent, 10), pad: n.id === "cd-d" ? 0 : n.textContent.length }));
    let settled = false;
    const write = (o, v) => { o.n.textContent = String(v).padStart(o.pad, "0"); };
    if (rows.every((o) => Number.isFinite(o.v))) {
      rows.forEach((o) => write(o, 0));
      const t0 = performance.now() + 900, dur = 1800;
      const step = (now) => {
        const p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
        rows.forEach((o) => write(o, Math.round(o.v * e)));
        if (p < 1) requestAnimationFrame(step);
        else setTimeout(() => { settled = true; }, 80);   // after the observer has seen our own last write
      };
      requestAnimationFrame(step);
    } else settled = true;
    const mo = new MutationObserver((list) => {
      if (!settled) return;
      list.forEach((m) => {
        const n = m.target.nodeType === 3 ? m.target.parentNode : m.target;
        if (!n || !n.classList) return;
        n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump");
      });
    });
    cd.forEach((n) => mo.observe(n, { childList: true, characterData: true, subtree: true }));
  }

  /* ---- Lightbox: replay the zoom when the photo changes ---- */
  const lb = document.getElementById("lb-img");
  if (lb) {
    new MutationObserver(() => {
      lb.style.animation = "none"; void lb.offsetWidth; lb.style.animation = "";
    }).observe(lb, { attributes: true, attributeFilter: ["src"] });
  }
})();
