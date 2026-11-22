
(() => {
  const PROFILE_KEY = "aftertoneProfile";
  const MEMORIES_KEY = "aftertoneMemories";
  const FOLDERS_KEY = "aftertoneFolders";

  const defaultFolders = [
    { id: "moments", name: "Мои моменты" },
    { id: "travel", name: "Путешествия" },
    { id: "friends", name: "Друзья" },
    { id: "special", name: "Особенные дни" }
  ];

  const $ = id => document.getElementById(id);

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  let profile = read(PROFILE_KEY, {});
  let memories = [];
  let folders = read(FOLDERS_KEY, defaultFolders);

  if (!Array.isArray(memories)) memories = [];
  if (!Array.isArray(folders)) folders = [...defaultFolders];

  
  if (localStorage.getItem(FOLDERS_KEY) === null) {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }

  let visibleMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );

  let selectedDate = localDate(new Date());
  let showAll = false;

  function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function displayDate(value) {
    if (!value) return "";
    return new Date(value + "T12:00:00").toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function monthTitle(date) {
    return date.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric"
    });
  }

  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function profileString(keys) {
    for (const key of keys) {
      if (typeof profile?.[key] === "string" && profile[key].trim()) {
        return profile[key].trim();
      }
    }
    return "";
  }

  function folderName(id) {
    return folders.find(f => f.id === id)?.name || "Без папки";
  }

  

  function initProfile() {
    const name = profileString([
      "name", "username", "userName", "displayName", "fullName"
    ]);

    const first = name ? name.split(" ")[0] : "друг";

    $("welcomeName").textContent = first;
    $("profileName").textContent = name || "Твоё пространство";
    $("profileInitial").textContent = first.charAt(0).toUpperCase();

    const animal = profileString([
      "companion", "selectedCompanion", "animal", "pet"
    ]).toLowerCase();

    const animalFiles = {
      owl: "owl",
      "сова": "owl",
      cat: "cat",
      "кошка": "cat",
      fox: "fox",
      "лиса": "fox",
      bunny: "bunny",
      rabbit: "bunny",
      "кролик": "bunny",
      bear: "bear",
      "медвежонок": "bear",
      deer: "deer",
      "оленёнок": "deer",
      "олененок": "deer"
    };

    const file = animalFiles[animal] || "deer";
    $("keeperImage").src = `images/companions/${file}.png`;

    const companionName = profileString([
      "companionName", "petName", "animalName"
    ]);

    if (companionName) {
      $("keeperCaption").textContent = companionName;
    }
  }



  
function renderFolders() {
  const target = $("folderGrid");
  if (!target) return;

  target.innerHTML = folders.map(folder => {
    const count = memories.filter(
      m => m.folderId === folder.id
    ).length;

    return `
      <div class="folder-tile">
        <button class="folder-open"
                type="button"
                data-open-folder="${safe(folder.id)}">
          <span class="folder-symbol"></span>
          <span class="folder-bottom">
            <strong>${safe(folder.name)}</strong>
            <small>${count} записей</small>
          </span>
        </button>

        <button class="folder-delete"
                type="button"
                data-delete-folder="${safe(folder.id)}"
                title="Удалить папку">
          ×
        </button>
      </div>
    `;
  }).join("");

  target.querySelectorAll("[data-open-folder]").forEach(button => {
    button.addEventListener("click", () => {
      openFolder(button.dataset.openFolder);
    });
  });

  target.querySelectorAll("[data-delete-folder]").forEach(button => {
    button.addEventListener("click", e => {
      e.stopPropagation();
      deleteFolder(button.dataset.deleteFolder);
    });
  });
}


  function createFolder() {
    const name = prompt("Как назовём новую папку?");

    if (name === null || !name.trim()) return;

    const newFolder = {
      id: "folder-" + Date.now(),
      name: name.trim()
    };

    folders.push(newFolder);

    try {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
      AT.pushPrefs().catch(() => {});
      renderFolders();
    } catch (error) {
      folders.pop();
      alert("Не удалось сохранить папку.");
      console.error(error);
    }
  }

  function deleteFolder(id) {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;

    const confirmed = confirm(
      `Удалить папку «${folder.name}»? Воспоминания сохранятся.`
    );

    if (!confirmed) return;

    const oldMemories = memories;

    memories = memories.map(m =>
      m.folderId === id ? { ...m, folderId: "" } : m
    );

    folders = folders.filter(f => f.id !== id);

    try {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
      AT.saveFolderMap(memories);

      renderFolders();
      renderRecent();
      renderCalendar();
    } catch (error) {
      memories = oldMemories;
      alert("Не удалось удалить папку.");
      console.error(error);
    }
  }

  function openFolder(id) {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;

    const entries = memories.filter(m => m.folderId === id);

    const overlay = document.createElement("div");
    overlay.className = "folder-overlay";

    overlay.innerHTML = `
      <div class="folder-dialog">
        <button class="folder-close" aria-label="Закрыть">×</button>
        <p class="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</p>
        <h2>${safe(folder.name)}</h2>

        <div class="folder-dialog-list">
          ${
            entries.length
              ? entries.map(m => `
                  <a href="memory.html?id=${encodeURIComponent(m.id)}">
                    ${safe(m.text || m.title || "Воспоминание")}
                    <small>${displayDate(m.date)}</small>
                  </a>
                `).join("")
              : '<p class="quiet-empty">В этой папке пока пусто.</p>'
          }
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector(".folder-close").addEventListener("click", () => {
      overlay.remove();
    });

    overlay.addEventListener("click", e => {
      if (e.target === overlay) overlay.remove();
    });
  }



  function renderRecent() {
    const target = $("recentGrid");
    if (!target) return;

    const recent = [...memories]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, showAll ? 1000 : 3);

    if (!recent.length) {
      target.innerHTML = `
        <div class="empty-state">
          Здесь начнётся твоя история.
          <small>
            Создай первое воспоминание, объединив фото, слова и музыку.
          </small>
        </div>
      `;
      return;
    }

    target.innerHTML = recent.map(m => {
      const image = (m.images && m.images[0]) || m.image || "";

      const visual = image
        ? `<img class="preview-photo" src="${image}" alt="">`
        : `<div class="preview-photo preview-placeholder">A.</div>`;

      return `
        <article class="memory-preview" data-memory="${safe(m.id)}">
          ${visual}
          <p class="preview-caption">
            ${safe(m.text || m.title || "Без названия")}
          </p>
          <p class="preview-date">
            ${displayDate(m.date)}
            ${m.songTitle ? " · ♫ " + safe(m.songTitle) : ""}
          </p>
        </article>
      `;
    }).join("");

    target.querySelectorAll("[data-memory]").forEach(card => {
      card.addEventListener("click", () => {
        location.href =
          `memory.html?id=${encodeURIComponent(card.dataset.memory)}`;
      });
    });

    if (memories.length > 3) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "subtle-button";
      more.style.gridColumn = "1 / -1";
      more.textContent = showAll ? "Свернуть" : `Показать все (${memories.length})`;
      more.addEventListener("click", () => { showAll = !showAll; renderRecent(); });
      target.appendChild(more);
    }
  }



  function calendarMarkup(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();

    const offset = (first.getDay() + 6) % 7;
    const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

    let html = names.map(n =>
      `<div class="calendar-day weekday">${n}</div>`
    ).join("");

    for (let i = 0; i < offset; i++) {
      html += '<div class="calendar-day"></div>';
    }

    for (let day = 1; day <= days; day++) {
      const dateKey = localDate(new Date(year, month, day));
      const mem = memories.find(m => m.date === dateKey);
      const has = !!mem;

      html += `
        <button class="calendar-day
          ${has ? "has-entry" : ""}
          ${dateKey === selectedDate ? "selected" : ""}
          ${dateKey === localDate(new Date()) ? "today" : ""}"
          data-date="${dateKey}"
          style="${mem && mem.accent ? `--mood:${mem.accent}` : ""}"
          type="button">
          ${day}
        </button>
      `;
    }

    return html;
  }

  function renderCalendar() {
    if (!$("miniCalendar") || !$("largeCalendar")) return;

    $("miniMonth").textContent = monthTitle(visibleMonth);
    $("miniCalendar").innerHTML = calendarMarkup(visibleMonth);

    $("largeMonth").textContent = monthTitle(visibleMonth);
    $("largeCalendar").innerHTML = calendarMarkup(visibleMonth);

    document.querySelectorAll("[data-date]").forEach(button => {
      button.addEventListener("click", () => {
        selectedDate = button.dataset.date;
        renderCalendar();
      });
    });

    renderSelectedDay();
  }

  function renderSelectedDay() {
    const list = memories.filter(m => m.date === selectedDate);

    $("miniSelected").innerHTML = list.length
      ? `
          <strong>${displayDate(selectedDate)}</strong><br>
          ${list.length} ${list.length === 1
            ? "воспоминание"
            : "воспоминаний"}
          · <a href="#" id="miniOpenDay">Посмотреть</a>
        `
      : `${displayDate(selectedDate)}<br>
         Пока без сохранённых моментов.`;

    if ($("miniOpenDay")) {
      $("miniOpenDay").addEventListener("click", e => {
        e.preventDefault();
        openCalendar();
      });
    }

    $("chosenDateTitle").textContent = displayDate(selectedDate);

    $("chosenDateEntries").innerHTML = list.length
      ? list.map(m => `
          <div class="day-entry">
            <a href="memory.html?id=${encodeURIComponent(m.id)}">
              ${safe(m.text || m.title || "Воспоминание")}
            </a>
            <p>
              ${safe(folderName(m.folderId))}
              ${m.songTitle ? " · " + safe(m.songTitle) : ""}
            </p>
          </div>
        `).join("")
      : `
          <p class="quiet-empty">
            В этот день пока нет записей.
            Можно сохранить новый момент и выбрать эту дату.
          </p>
        `;
  }

  function openCalendar() {
    $("calendarPage").classList.add("is-open");
    $("calendarPage").setAttribute("aria-hidden", "false");
    renderCalendar();
  }

  function closeCalendar() {
    $("calendarPage").classList.remove("is-open");
    $("calendarPage").setAttribute("aria-hidden", "true");
  }



  $("newFolderButton").addEventListener("click", createFolder);

  $("miniPrev").addEventListener("click", () => {
    visibleMonth.setMonth(visibleMonth.getMonth() - 1);
    renderCalendar();
  });

  $("miniNext").addEventListener("click", () => {
    visibleMonth.setMonth(visibleMonth.getMonth() + 1);
    renderCalendar();
  });

  $("largePrev").addEventListener("click", () => {
    visibleMonth.setMonth(visibleMonth.getMonth() - 1);
    renderCalendar();
  });

  $("largeNext").addEventListener("click", () => {
    visibleMonth.setMonth(visibleMonth.getMonth() + 1);
    renderCalendar();
  });

  $("closeCalendar").addEventListener("click", closeCalendar);

  document.querySelectorAll('.side-link[href*="#calendar"]').forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      openCalendar();
    });
  });

  document.querySelectorAll('.side-link[href*="#memories"]').forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      $("memories").scrollIntoView({ behavior: "smooth" });
    });
  });

  document.querySelectorAll('.side-link[href*="#folders"]').forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      $("folders").scrollIntoView({ behavior: "smooth" });
    });
  });

  

  $("todayLabel").textContent = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  initProfile();
  renderFolders();
  renderRecent();
  renderCalendar();
  AT.api("/auth/me").then((d) => { if ($("myPage")) $("myPage").href = "profile.html?u=" + encodeURIComponent(d.user.username); }).catch(() => {});
  AT.syncDown().catch(() => {})
    .then(() => { profile = read(PROFILE_KEY, {}); const f = read(FOLDERS_KEY, null); if (Array.isArray(f)) folders = f; initProfile(); return AT.loadMemories(); })
    .then((list) => { memories = list; renderFolders(); renderRecent(); renderCalendar(); renderOnThisDay(); })
    .catch(console.error);

  // «В этот день»: воспоминания месяц, три, шесть месяцев и годы назад (для демо: dashboard.html?asOf=ГГГГ-ММ-ДД)
  async function renderOnThisDay() {
    try {
      const asOf = new URLSearchParams(location.search).get("asOf");
      const { items } = await AT.api("/days/on-this-day" + (asOf ? "?asOf=" + encodeURIComponent(asOf) : ""));
      if (!items.length) return;
      $("otd").classList.remove("hidden");
      $("otdList").innerHTML = items.slice(0, 3).map(x => `
        <a class="otd-card" href="memory.html?id=${x.day.id}">
          <img src="${x.day.cover}" alt="">
          <span><small>${safe(x.label).toUpperCase()}</small><strong>${safe(x.day.title)}</strong></span>
        </a>`).join("");
    } catch { /* блока просто не будет */ }
  }

  if (location.hash === "#calendar") openCalendar();
  if (location.hash === "#folders") $("folders").scrollIntoView();
  if (location.hash === "#memories") $("memories").scrollIntoView();



  const style = document.createElement("style");

  style.textContent = `
    .folder-overlay {
      position: fixed;
      inset: 0;
      background: #39343b55;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 20px;
    }

    .folder-dialog {
      width: min(440px, 100%);
      max-height: 80vh;
      overflow: auto;
      background: #fbf9f5;
      padding: 30px;
      position: relative;
      border: 1px solid #e4dcd2;
    }

    .folder-dialog h2 {
      font: 27px 'Playfair Display', serif;
      font-weight: 400;
      margin: 10px 0 20px;
    }

    .folder-close {
      position: absolute;
      right: 15px;
      top: 10px;
      border: 0;
      background: none;
      font-size: 25px;
      color: #89817f;
      cursor: pointer;
    }

    .folder-dialog-list {
      display: grid;
    }

    .folder-dialog-list a {
      padding: 13px 0;
      border-top: 1px solid #e4dcd2;
      font: 16px 'Playfair Display', serif;
    }

    .folder-dialog-list small {
      display: block;
      margin-top: 5px;
      font: 10px 'DM Sans', sans-serif;
      color: #89817f;
    }
  `;

  document.head.appendChild(style);

})();

