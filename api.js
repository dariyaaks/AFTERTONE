/* Общий слой связи с бэкендом для всех страниц дневника */
(() => {
  const token = localStorage.getItem("aftertone_token");
  if (!token && !window.AT_PUBLIC) location.href = "vhod.html";

  async function api(path, opt = {}) {
    const headers = { ...(token ? { authorization: "Bearer " + token } : {}), ...(opt.json ? { "content-type": "application/json" } : {}) };
    const r = await fetch("/api" + path, { method: opt.method || "GET", headers, body: opt.json ? JSON.stringify(opt.json) : opt.body });
    if (r.status === 401 && !window.AT_PUBLIC) { localStorage.removeItem("aftertone_token"); location.href = "vhod.html"; }
    const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Ошибка " + r.status);
    return data;
  }

  // Папки хранятся в браузере: соответствие «воспоминание → папка»
  const MAP = "aftertoneFolderMap";
  const folderMap = () => { try { return JSON.parse(localStorage.getItem(MAP)) || {}; } catch { return {}; } };
  const setFolder = (id, folderId) => { const m = folderMap(); if (folderId) m[id] = folderId; else delete m[id]; localStorage.setItem(MAP, JSON.stringify(m)); pushPrefs().catch(() => {}); };
  const saveFolderMap = (list) => { const m = {}; list.forEach((x) => { if (x.folderId) m[x.id] = x.folderId; }); localStorage.setItem(MAP, JSON.stringify(m)); pushPrefs().catch(() => {}); };

  // Воспоминания с сервера в том виде, который ждёт её дашборд
  async function loadMemories() {
    const { items } = await api("/days?limit=100");
    const m = folderMap();
    return items.map((c) => ({
      id: String(c.id), title: c.title, text: c.text || c.title, date: c.date,
      images: c.cover ? [c.cover] : [], image: c.cover || "", songTitle: c.song || "", folderId: m[c.id] || "",
      style: c.styleLabel, mood: c.moodLabel, accent: c.accent,
    }));
  }

  const PROFILE = "aftertoneProfile", FOLDERS = "aftertoneFolders";
  const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  // Профиль, папки и их содержимое живут на сервере и подтягиваются на любом устройстве
  async function pushPrefs() {
    const profile = { ...read(PROFILE, {}) }; delete profile.avatar;
    await api("/auth/prefs", { method: "PUT", json: { profile, folders: read(FOLDERS, []), map: folderMap() } });
  }
  async function syncDown() {
    const { prefs } = await api("/auth/prefs");
    if (!prefs.profile && !prefs.folders) { await pushPrefs().catch(() => {}); return; }
    if (prefs.profile) localStorage.setItem(PROFILE, JSON.stringify({ ...prefs.profile, avatar: read(PROFILE, {}).avatar || "" }));
    if (prefs.folders?.length) localStorage.setItem(FOLDERS, JSON.stringify(prefs.folders));
    if (prefs.map) localStorage.setItem(MAP, JSON.stringify(prefs.map));
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#logout")) { localStorage.removeItem("aftertone_token"); }
  });
  window.AT = { token, api, loadMemories, folderMap, setFolder, saveFolderMap, pushPrefs, syncDown };
})();
