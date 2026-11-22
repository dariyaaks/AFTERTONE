/* Кино-плеер воспоминания: рисует сцену по параметрам, которые посчитал сервер */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STYLES = { auto: "Подобрать автоматически", impressionist: "Моне · импрессионизм", constructivist: "Кандинский · абстракция", film: "Плёнка · ретро", minimal: "Минимализм · Япония" };
  let anims = [], timers = [], ctx, gainNode, lowpass, audioEl, cur, opt = {};
  const $ = (sel) => document.querySelector("#cinema " + sel);

  function stopAll() {
    anims.forEach((a) => a.cancel()); anims = [];
    timers.forEach(clearTimeout); timers = [];
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
    window.speechSynthesis?.cancel();
    const st = $(".cn-stage");
    if (st && cur) { st.classList.remove("cine"); $(".q").innerHTML = ""; $(".vg").style.setProperty("--vg", cur.scene.motion.vignette); }
  }

  function duck(on) {
    if (!gainNode) return;
    const d = cur.scene.audio.ducking; if (!d) return;
    const t = ctx.currentTime;
    gainNode.gain.setTargetAtTime(on ? d.duckGain : 0.9, t, (on ? d.attackMs : d.releaseMs) / 3000);
    lowpass.frequency.setTargetAtTime(on ? d.lowpassHz : 20000, t, 0.2);
  }
  function wireAudio() {
    if (!audioEl || audioEl._wired) return;
    try {
      ctx = ctx || new AudioContext();
      const src = ctx.createMediaElementSource(audioEl);
      lowpass = ctx.createBiquadFilter(); lowpass.type = "lowpass"; lowpass.frequency.value = 20000;
      gainNode = ctx.createGain(); gainNode.gain.value = 0.9;
      src.connect(lowpass).connect(gainNode).connect(ctx.destination);
      audioEl._wired = true;
    } catch { /* без Web Audio музыка просто играет без приглушения */ }
  }
  function startMusic() { if (audioEl) { wireAudio(); ctx && ctx.resume(); audioEl.play().catch(() => {}); } }

  function play() {
    stopAll();
    const s = cur.scene, st = $(".cn-stage"), imgs = [...st.querySelectorAll("img")].reverse(); // в DOM фото идут в обратном порядке
    startMusic();
    if (cur.format !== "collage") {
      s.timeline.forEach((seg) => {
        const k = seg.kenBurns;
        const f = `scale(${k.fromScale}) translate(${k.fromX * 100}%,${k.fromY * 100}%)`, t = `scale(${k.toScale}) translate(${k.toX * 100}%,${k.toY * 100}%)`;
        anims.push(imgs[seg.index].animate([{ opacity: 0, transform: f }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0, transform: t }], { duration: seg.duration * 1000 + 600, delay: seg.start * 1000, fill: "both" }));
      });
    }
    const q = s.audio.quote;
    if (q) {
      timers.push(setTimeout(() => {
        st.classList.add("cine"); duck(true);
        $(".vg").style.setProperty("--vg", s.audio.cinematic.vignetteTo);
        const words = q.text.split(/\s+/);
        $(".q").innerHTML = words.map((w) => `<span>${esc(w)}</span>`).join("");
        words.forEach((_, i) => timers.push(setTimeout(() => $(".q").children[i]?.classList.add("on"), (i * q.durationSec * 800) / words.length)));
        timers.push(setTimeout(() => { st.classList.remove("cine"); duck(false); $(".q").innerHTML = ""; $(".vg").style.setProperty("--vg", s.motion.vignette); }, q.durationSec * 1000));
      }, q.startAt * 1000));
    }
    timers.push(setTimeout(play, s.motion.durationSeconds * 1000 + 800));
  }

  function voice() {
    const v = cur.scene.audio.voice, u = new SpeechSynthesisUtterance(cur.text);
    speechSynthesis.cancel();
    u.lang = v.lang; u.rate = v.rate; u.pitch = v.pitch;
    u.onstart = () => duck(true); u.onend = () => duck(false);
    startMusic();
    speechSynthesis.speak(u);
  }

  /* ---- аватар: лицо меняется от настроения дня ---- */
  let uid = 0;
  function avatarSvg(av, size = 110) {
    const e = av.expression, a = av.aura, id = "av" + ++uid;
    const eye = (3 + 6 * e.eyeOpenness).toFixed(1);
    const brow = (x, side) => `<line x1="${x - 8}" y1="${(38 + side * e.browAngle * 4).toFixed(1)}" x2="${x + 8}" y2="${(38 - side * e.browAngle * 4).toFixed(1)}" stroke="#4a3f4a" stroke-width="2.4" stroke-linecap="round"/>`;
    const props = (av.props || []).map((p) => ({ mug: '<text x="72" y="98" font-size="20">☕</text>', umbrella: '<text x="30" y="16" font-size="22">☂️</text>' }[p] || "")).join("");
    const phones = (av.props || []).includes("headphones") ? `<path d="M17 52 A33 33 0 0 1 83 52" stroke="#4a3f4a" stroke-width="4" fill="none"/><rect x="11" y="48" width="9" height="17" rx="4" fill="${a.color}"/><rect x="80" y="48" width="9" height="17" rx="4" fill="${a.color}"/>` : "";
    const scarf = ["scarf"].includes(av.outfit) ? `<path d="M24 86 Q50 98 76 86 L74 97 Q50 108 26 97Z" fill="${a.color}"/>` : "";
    return `<svg viewBox="-12 -12 124 124" width="${size}" height="${size}" role="img" aria-label="${esc(av.label)}">
      <defs><radialGradient id="${id}"><stop offset="0" stop-color="${a.color}" stop-opacity="${a.intensity}"/><stop offset="1" stop-color="${a.color}" stop-opacity="0"/></radialGradient></defs>
      <circle cx="50" cy="50" r="${(56 * a.radius).toFixed(1)}" fill="url(#${id})"/>
      <g class="br" style="--d:${(60 / av.breathPerMin).toFixed(2)}s">
        ${scarf}<circle cx="50" cy="50" r="34" fill="#f6e6d8" stroke="#4a3f4a" stroke-width="2"/>${phones}
        ${e.blush ? '<circle cx="31" cy="60" r="6" fill="#e9a3a3" opacity=".55"/><circle cx="69" cy="60" r="6" fill="#e9a3a3" opacity=".55"/>' : ""}
        <ellipse cx="38" cy="48" rx="3.6" ry="${eye}" fill="#4a3f4a"/><ellipse cx="62" cy="48" rx="3.6" ry="${eye}" fill="#4a3f4a"/>
        ${brow(38, 1)}${brow(62, -1)}
        <path d="M34 67 Q50 ${(67 + e.mouthCurve * 14).toFixed(1)} 66 67" stroke="#4a3f4a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      </g>${props}</svg>`;
  }

  /* ---- частицы: погода, время года и приём дня ---- */
  let stopFx = null;
  function startFx(stage, cfg, pal) {
    if (stopFx) stopFx();
    if (!cfg || cfg.type === "none") return;
    const cv = document.createElement("canvas"); cv.className = "cn-fx"; stage.appendChild(cv);
    const g = cv.getContext("2d"), R = Math.random, cols = [pal.highlight, pal.accent, pal.accent2];
    let W = (cv.width = stage.clientWidth || 400), H = (cv.height = stage.clientHeight || 500), raf;
    const items = Array.from({ length: Math.round(25 + cfg.density * 70) }, () => ({ x: R() * W, y: R() * H, s: 0.5 + R() * 1.5, r: R() * 6.28, v: 0.4 + R() * cfg.speed * 1.2, p: R() * 6.28 }));
    const frame = (t) => {
      g.clearRect(0, 0, W, H);
      items.forEach((p, i) => {
        g.save();
        if (cfg.type === "rain") { p.y += p.v * 14; p.x += 1.5; g.strokeStyle = "rgba(255,255,255,.45)"; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 2, p.y - 12 * p.s); g.stroke(); }
        else if (cfg.type === "snow") { p.y += p.v * 1.2; p.x += Math.sin(t / 900 + p.p) * 0.6; g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(p.x, p.y, 1.5 + p.s * 1.5, 0, 6.28); g.fill(); }
        else if (cfg.type === "leaves") { p.y += p.v * 1.1; p.x += Math.sin(t / 700 + p.p) * 1.1; p.r += 0.03; g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = cols[i % 3]; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(0, 0, 6 * p.s, 3 * p.s, 0, 0, 6.28); g.fill(); }
        else if (cfg.type === "fireflies") { p.x += Math.sin(t / 1500 + p.p) * 0.4; p.y += Math.cos(t / 1700 + p.p) * 0.3; g.shadowBlur = 14; g.shadowColor = "#ffe98a"; g.fillStyle = `rgba(255,240,150,${0.5 + 0.5 * Math.sin(t / 500 + p.p)})`; g.beginPath(); g.arc(p.x, p.y, 1.5 + p.s, 0, 6.28); g.fill(); }
        else if (cfg.type === "dust") { p.x += p.v * 0.15; p.y -= p.v * 0.1; g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(p.x, p.y, p.s * 0.8, 0, 6.28); g.fill(); }
        else { p.x += p.v * 1.4; p.y += p.v * 0.8; g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = 0.6; g.fillStyle = cols[i % 3]; g.fillRect(-12 * p.s, -1, 24 * p.s, 2); }
        g.restore();
        if (p.y > H + 20) { p.y = -20; p.x = R() * W; }
        if (p.x > W + 20) { p.x = -20; p.y = R() * H; }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    stopFx = () => { cancelAnimationFrame(raf); cv.remove(); stopFx = null; };
  }

  async function mountPlayer(day, options = {}) {
    stopAll(); cur = day; opt = options;
    const el = document.getElementById("cinema"), s = day.scene, p = s.palette;
    el.style.cssText = `--c-bg:${p.bg};--c-surface:${p.surface};--c-tx:${p.text};--c-ac:${p.accent};--grain:${s.motion.grain};background-image:radial-gradient(circle at 15% 0%,${p.gradient[0]}66,transparent 60%),radial-gradient(circle at 95% 100%,${p.gradient[1]}55,transparent 55%)`;
    const shareUrl = day.visibility === "public" ? `${location.origin}/share.html?s=${day.slug}` : "";
    el.innerHTML = `
      <p class="cn-eyebrow">КИНО ТВОЕГО ДНЯ</p>
      <h2 class="cn-title">${esc(day.title)}</h2>
      <p class="cn-sub">${esc(s.styleLabel)} · ${esc(s.mood.label)}</p>
      <div class="cn-avatar">${avatarSvg(s.avatar, 96)}<span>настроение дня: ${esc(s.avatar.label)}</span></div>
      <div class="cn-stage ${esc(day.format)}"><div class="bar t"></div><div class="bar b"></div><div class="vg"></div><div class="q"></div></div>
      <div class="cn-ctrl"><button class="cn-btn" data-a="play">▶ Смотреть и слушать</button>${"speechSynthesis" in window ? '<button class="cn-btn" data-a="voice">🔊 Озвучить запись</button>' : ""}</div>
      ${options.owner ? `<div class="cn-tools">
        <label>Приём<select id="cnStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${k === (s.styleForced ? s.style : "auto") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Формат<select id="cnFormat">${[["video", "Видео"], ["slideshow", "Слайд-шоу"], ["collage", "Коллаж"]].map(([k, v]) => `<option value="${k}" ${k === day.format ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <button class="cn-btn ghost" data-a="regen">Пересобрать</button>
        <button class="cn-btn ghost" data-a="share">${day.visibility === "public" ? "Закрыть доступ" : "Поделиться по ссылке"}</button>
        <button class="cn-btn ghost danger" data-a="del">Удалить</button>
      </div><p class="cn-link">${shareUrl ? `Ссылка: <a href="${shareUrl}" target="_blank" rel="noopener">${shareUrl}</a> <button class="cn-copy" data-a="copy">копировать</button>` : ""}</p><p class="cn-msg" id="cnMsg"></p>` : ""}
      <h3 class="cn-h3">Почему день выглядит так</h3>
      <div class="cn-pass">${day.passport.map((x) => `<div><b>${esc(x.title)}</b><p>${esc(x.observation)}</p><p class="eff">→ ${esc(x.effect)}</p><p>${esc(x.why)}</p></div>`).join("")}</div>
      <p class="cn-disc">${esc(s.disclaimer)}</p>`;
    const st = $(".cn-stage");
    $(".vg").style.setProperty("--vg", s.motion.vignette);
    const imgs = day.photos.map((ph) => { const i = new Image(); i.src = ph.url; i.alt = ""; i.style.filter = s.filters.css; st.prepend(i); return i; }); 
    if (day.format === "collage") s.collage.items.forEach((c) => { const i = st.querySelectorAll("img")[day.photos.length - 1 - c.index]; Object.assign(i.style, { left: c.x * 100 + "%", top: c.y * 100 + "%", width: c.w * 100 + "%", height: c.h * 100 + "%", opacity: 1, transform: `rotate(${c.rotate}deg)`, zIndex: c.z }); });
    startFx(st, s.particles, p);
    audioEl = null;
    if (s.audio.music.src) { audioEl = new Audio(); audioEl.crossOrigin = "anonymous"; audioEl.src = s.audio.music.src; audioEl.loop = true; }

    el.onclick = async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      const msg = $("#cnMsg");
      try {
        if (a === "play") play();
        else if (a === "voice") voice();
        else if (a === "copy") { await navigator.clipboard.writeText(shareUrl); msg.textContent = "Ссылка скопирована"; }
        else if (a === "regen") { msg.textContent = "Пересобираем…"; const { day: d } = await AT.api(`/days/${day.id}/regenerate`, { method: "POST", json: { style: $("#cnStyle").value, format: $("#cnFormat").value } }); mountPlayer(d, options); }
        else if (a === "share") { const pub = day.visibility !== "public"; const { day: d } = await AT.api(`/days/${day.id}`, { method: "PATCH", json: { visibility: pub ? "public" : "private" } }); mountPlayer(d, options); }
        else if (a === "del" && confirm("Удалить это воспоминание навсегда?")) { await AT.api(`/days/${day.id}`, { method: "DELETE" }); location.href = "dashboard.html"; }
      } catch (err) { if (msg) msg.textContent = err.message; }
    };
  }
  window.mountPlayer = mountPlayer;
  window.avatarSvg = avatarSvg;
})();
