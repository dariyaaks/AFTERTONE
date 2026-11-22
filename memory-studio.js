
(() => {
  const $ = id => document.getElementById(id);

  const KEY = "aftertoneMemories";
  const FOLDER_KEY = "aftertoneFolders";
  const MAX_PHOTOS = 6;

  // Замени адреса, когда backend будет готов.
  const API = {
    transcribe: "/api/transcribe",
    generate: "/api/generate"
  };

  let selectedImages = [];
  let selectedFormat = "collage";
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function localDate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function displayDate(value) {
    if (!value) return "ДАТА";

    return new Date(value + "T12:00:00")
      .toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
  }

  function loadFolders() {
    const folders = read(FOLDER_KEY, []);
    const select = $("memoryFolder");

    select.innerHTML = '<option value="">Без папки</option>';

    if (!Array.isArray(folders)) return;

    folders.forEach(folder => {
      if (!folder || typeof folder !== "object") return;

      const option = document.createElement("option");
      option.value = String(folder.id ?? folder.name ?? "");
      option.textContent = String(folder.name ?? "Без названия");

      select.appendChild(option);
    });
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxSide = 1400;
          const ratio = Math.min(
            1,
            maxSide / Math.max(image.width, image.height)
          );

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * ratio);
          canvas.height = Math.round(image.height * ratio);

          canvas.getContext("2d").drawImage(
            image, 0, 0, canvas.width, canvas.height
          );

          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };

        image.onerror = reject;
        image.src = reader.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function updatePreview() {
    const title =
      $("memoryTitle").value.trim() || "маленькая история";

    const text =
      $("memoryText").value.trim() ||
      "Твои слова появятся здесь. Напиши о том, что происходило, что ты чувствовала и почему хочется сохранить этот день.";

    const date = displayDate($("memoryDate").value);

    $("previewTitle").textContent = title;
    $("previewRightTitle").textContent = title;
    $("previewText").textContent = text;
    $("previewDate").textContent = date.toUpperCase();
    $("previewRightDate").textContent = date.toUpperCase();
    $("previewSong").textContent =
      $("songTitle").value.trim() || "Песня пока не добавлена";

    const target = $("previewPhotos");

    if (!selectedImages.length) {
      target.innerHTML =
        '<div class="photo-placeholder">Здесь будет<br>твоя фотография</div>';
      return;
    }

    target.innerHTML = selectedImages.map((src, index) => `
      <img class="collage-item"
        src="${src}"
        alt="Фотография ${index + 1}">
    `).join("");
  }

  function renderThumbnails() {
    $("photoThumbnails").innerHTML = selectedImages.map((src, index) => `
      <div class="photo-thumb-wrap">
        <img class="photo-thumb" src="${src}" alt="Фотография">
        <button type="button" class="remove-photo"
          data-index="${index}" aria-label="Удалить">×</button>
      </div>
    `).join("");

    document.querySelectorAll(".remove-photo").forEach(button => {
      button.addEventListener("click", () => {
        selectedImages.splice(Number(button.dataset.index), 1);
        renderThumbnails();
        updatePreview();
      });
    });
  }

  $("memoryPhotos").addEventListener("change", async event => {
    const files = Array.from(event.target.files || [])
      .filter(file => file.type.startsWith("image/"));

    const available = MAX_PHOTOS - selectedImages.length;

    if (available <= 0) {
      alert("Можно добавить максимум 6 фотографий.");
      event.target.value = "";
      return;
    }

    try {
      const images = await Promise.all(
        files.slice(0, available).map(compressImage)
      );

      selectedImages.push(...images);
      renderThumbnails();
      updatePreview();

      if (files.length > available) {
        alert("Добавлены только первые фотографии, помещающиеся в коллаж.");
      }
    } catch {
      alert("Не удалось загрузить фотографию.");
    }

    event.target.value = "";
  });

  ["memoryTitle", "memoryText", "memoryDate", "songTitle"]
    .forEach(id => $(id).addEventListener("input", updatePreview));

  // Выбор формата
  document.querySelectorAll(".generation-option").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".generation-option")
        .forEach(item => item.classList.remove("selected"));

      button.classList.add("selected");
      selectedFormat = button.dataset.format;
    });
  });

  // Голосовой ввод: распознавание речи в браузере (Chrome, Edge, Safari)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  function setRecording(on) {
    isRecording = on;
    $("voiceButton").classList.toggle("recording", on);
    $("voiceButtonText").textContent = on ? "Остановить запись" : "Записать голос";
    $("voiceIcon").textContent = on ? "■" : "🎙";
  }
  $("voiceButton").addEventListener("click", () => {
    if (!SR) { $("voiceStatus").textContent = "Голосовой ввод работает в Chrome, Edge и Safari."; return; }
    if (isRecording) { recognizer.stop(); return; }
    recognizer = new SR();
    recognizer.lang = "ru-RU";
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.onresult = (e) => {
      const said = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript.trim()).join(" ");
      const t = $("memoryText");
      t.value = t.value.trim() ? t.value.trim() + " " + said : said;
      updatePreview();
    };
    recognizer.onerror = () => { $("voiceStatus").textContent = "Не удалось получить доступ к микрофону. Проверь разрешения браузера."; setRecording(false); };
    recognizer.onend = () => { setRecording(false); $("voiceStatus").textContent = "Готово! Проверь распознанный текст."; };
    recognizer.start();
    setRecording(true);
    $("voiceStatus").textContent = "Говори, я слушаю…";
  });

  // Подготовка фотографий для отправки на backend
  function dataURLtoBlob(dataURL) {
    const [header, data] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  // Создание воспоминания на сервере: анализ текста, фото и песни → сцена дня
  async function parseSong() {
    const raw = $("songTitle").value.trim();
    if (!raw) return null;
    const parts = raw.split(/\s[—–-]\s/);
    const music = { title: parts[0].trim(), artist: (parts[1] || "").trim(), url: $("songUrl").value.trim() };
    try { // подтягиваем жанр, год и 30-секундный фрагмент, чтобы песня звучала и влияла на ритм
      const { items } = await AT.api("/music/search?q=" + encodeURIComponent(raw.replace(/\s[—–-]\s/, " ")));
      const hit = items[0];
      if (hit) Object.assign(music, { title: hit.title, artist: hit.artist, genre: hit.genre, year: hit.year, previewUrl: hit.previewUrl, url: music.url || hit.url, source: "search" });
    } catch { /* без поиска песня всё равно учтётся по названию */ }
    return music;
  }

  async function createMemory(button) {
    const title = $("memoryTitle").value.trim();
    const text = $("memoryText").value.trim() || title;
    const date = $("memoryDate").value;
    const songUrl = $("songUrl").value.trim();
    if (text.length < 5) return alert("Напиши о дне хотя бы пару слов.");
    if (!date) return alert("Выбери дату.");
    if (!selectedImages.length) return alert("Добавь хотя бы одну фотографию.");
    if (songUrl) {
      try { if (!["http:", "https:"].includes(new URL(songUrl).protocol)) throw 0; } catch { return alert("Проверь ссылку на песню."); }
    }
    const status = $("generationStatus");
    const label = button.innerHTML;
    $("saveMemory").disabled = true; $("generateMemory").disabled = true;
    button.textContent = "Собираем воспоминание…";
    status.textContent = "Читаем текст, цвета фото и ритм песни…";
    try {
      const fd = new FormData();
      fd.append("text", text); fd.append("date", date); fd.append("format", selectedFormat);
      if (title) fd.append("title", title);
      const mood = $("memoryMood").value;
      const forced = { nostalgic: "film", warm: "impressionist", dreamy: "impressionist", minimal: "minimal", playful: "constructivist" }[mood];
      if (forced) fd.append("style", forced);
      const music = await parseSong();
      if (music) fd.append("music", JSON.stringify(music));
      selectedImages.forEach((img, i) => fd.append("photos", dataURLtoBlob(img), `photo-${i + 1}.jpg`));
      const { day } = await AT.api("/days", { method: "POST", body: fd });
      if ($("memoryFolder").value) AT.setFolder(String(day.id), $("memoryFolder").value);
      location.href = `memory.html?id=${day.id}`;
    } catch (error) {
      status.textContent = error.message;
      alert(error.message);
      button.innerHTML = label;
      $("saveMemory").disabled = false; $("generateMemory").disabled = false;
    }
  }

  $("generateMemory").addEventListener("click", () => createMemory($("generateMemory")));
  $("saveMemory").addEventListener("click", () => createMemory($("saveMemory")));

  $("memoryDate").value = localDate(new Date());

  loadFolders();
  updatePreview();
})();
