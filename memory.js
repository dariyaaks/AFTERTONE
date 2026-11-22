
(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const $ = id => document.getElementById(id);

  let memory = null;
  try {
    const { day } = await AT.api("/days/" + encodeURIComponent(id));
    memory = {
      id: String(day.id), title: day.title, text: day.text, date: day.date,
      images: day.photos.map((p) => p.url),
      songTitle: [day.music.artist, day.music.title].filter(Boolean).join(" — "),
      songUrl: day.music.url || "",
      day
    };
  } catch { /* покажем «не найдено» */ }

  if (!memory) {
    $("detailTitle").textContent = "Воспоминание не найдено";
    $("detailText").textContent = "Возможно, запись была удалена или ссылка устарела.";
    $("detailPhotos").innerHTML =
      '<div class="photo-placeholder">Здесь пока пусто</div>';
    return;
  }

  const date = memory.date
    ? new Date(memory.date + "T12:00:00").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : "";

  const title = memory.title || memory.text || "Мой момент";
  const fullText = memory.text || "";

  $("detailTitle").textContent = title;
  $("detailRightTitle").textContent = title;
  $("detailDate").textContent = date;
  $("detailPhotoDate").textContent = date.toLocaleUpperCase("ru-RU");
  $("detailRightDate").textContent = date.toLocaleUpperCase("ru-RU");
  $("detailCaption").textContent = title;

  const images = memory.images?.length
    ? memory.images
    : (memory.image ? [memory.image] : []);

  $("detailPhotos").innerHTML = images.length
    ? images.slice(0, 3).map((src, i) =>
        `<img class="collage-item" src="${src}" alt="Фотография воспоминания ${i + 1}">`
      ).join("")
    : '<div class="photo-placeholder">Фотография<br>этого момента</div>';

 
  if (memory.songTitle) {
    $("detailSongTitle").textContent = memory.songTitle;

    const url = memory.songUrl || "";
    const match = url.match(
      /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/
    );

    if (match) {
      const player = document.createElement("iframe");

      player.src = `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator`;
      player.width = "100%";
      player.height = "152";
      player.style.border = "0";
      player.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      player.loading = "lazy";
      player.title = "Spotify music player";

      $("detailSongLink").style.display = "none";
      $("detailSong").appendChild(player);
    } else {
      $("detailSongLink").href = url;
      $("detailSongLink").style.display = url ? "inline-block" : "none";
    }
  } else {
    $("detailSong").style.display = "none";
  }

  
  function splitText(text, target, maxHeight) {
    if (!text.trim()) return [""];

    const style = getComputedStyle(target);
    const measure = document.createElement("div");

    Object.assign(measure.style, {
      position: "absolute",
      visibility: "hidden",
      pointerEvents: "none",
      left: "-10000px",
      top: "0",
      width: target.clientWidth + "px",
      font: style.font,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      padding: "0",
      margin: "0",
      border: "0"
    });

    document.body.appendChild(measure);

    const tokens = text.match(/\S+\s*|\s+/g) || [];
    const pages = [];
    let current = "";

    for (const token of tokens) {
      const candidate = current + token;
      measure.textContent = candidate;

      if (current && measure.scrollHeight > maxHeight) {
        pages.push(current.trim());
        current = token.trimStart();
        measure.textContent = current;
      } else {
        current = candidate;
      }
    }

    if (current.trim()) pages.push(current.trim());

    measure.remove();
    return pages.length ? pages : [""];
  }

  function createContinuationPage(text, pageNumber, pageDate) {
    const section = document.createElement("section");
    section.className = "notebook-page continuation-page";

    const dateLabel = document.createElement("p");
    dateLabel.className = "right-page-date";
    dateLabel.textContent = pageDate.toLocaleUpperCase("ru-RU");

    const heading = document.createElement("h2");
    heading.textContent = "Продолжение истории";

    const content = document.createElement("p");
    content.className = "preview-note-text continuation-text";
    content.textContent = text;

    const number = document.createElement("span");
    number.className = "page-number";
    number.textContent = String(pageNumber).padStart(2, "0");

    section.append(dateLabel, heading, content, number);
    return section;
  }

  function createContinuationSpreads(pages) {
    const mainNotebook = $("mainNotebook");
    const bottomNote = document.querySelector(".detail-bottom-note");

    
    document.querySelectorAll(".continuation-notebook").forEach(el => el.remove());

    for (let i = 0; i < pages.length; i += 2) {
      const spread = document.createElement("div");
      spread.className = "notebook detail-notebook continuation-notebook";

      spread.appendChild(
        createContinuationPage(pages[i], i + 3, date)
      );

      if (pages[i + 1] !== undefined) {
        spread.appendChild(
          createContinuationPage(pages[i + 1], i + 4, date)
        );
      }

      if (bottomNote) {
        bottomNote.before(spread);
      } else {
        mainNotebook.after(spread);
      }
    }
  }

  function paginate() {
    const firstPage = $("detailText");

  
    const firstPages = splitText(fullText, firstPage, 245);

    firstPage.textContent = firstPages[0] || "";

   
    const remaining = firstPages.slice(1);
    const continuationMeasure = document.createElement("p");

    continuationMeasure.className = "preview-note-text continuation-text";
    continuationMeasure.style.position = "absolute";
    continuationMeasure.style.visibility = "hidden";
    continuationMeasure.style.width =
      firstPage.clientWidth + "px";

    document.body.appendChild(continuationMeasure);

    const extraPages = [];

    remaining.forEach(chunk => {
      const parts = splitText(chunk, continuationMeasure, 420);
      extraPages.push(...parts);
    });

    continuationMeasure.remove();
    createContinuationSpreads(extraPages);
  }

  window.mountPlayer(memory.day, { owner: true });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(paginate);
  } else {
    window.addEventListener("load", paginate);
  }


  let resizeTimeout;

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(paginate, 250);
  });
})();

