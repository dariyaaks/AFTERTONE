const steps = [...document.querySelectorAll(".step-panel")];
const progressFill = document.getElementById("progress-fill");
const stepLabel = document.getElementById("step-label");
const stepCaption = document.getElementById("step-caption");
const backButton = document.getElementById("back-button");
const nextButton = document.getElementById("next-button");
const finishButton = document.getElementById("finish-button");
const formActions = document.getElementById("form-actions");
const formFootnote = document.getElementById("form-footnote");

const nameInput = document.getElementById("display-name");
const aboutInput = document.getElementById("about-you");
const avatarInput = document.getElementById("profile-image");
const avatarPreview = document.getElementById("avatar-preview");
const avatarPlaceholder = document.getElementById("avatar-placeholder");
const companionNameInput = document.getElementById("companion-name");

const token = localStorage.getItem("aftertone_token");
if (!token) location.href = "vhod.html";
document.getElementById("exit-link").addEventListener("click", () => localStorage.removeItem("aftertone_token"));
// имя уже спрашивали при регистрации — подставляем
fetch("/api/auth/me", { headers: { authorization: "Bearer " + token } })
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => { if (d && !nameInput.value && d.user.displayName !== "Без имени") nameInput.value = d.user.displayName; })
  .catch(() => {});

let currentStep = 0;
let selectedCompanion = "";
let selectedInterests = [];
let avatarData = "";

const stepNames = ["ТВОЙ ПРОФИЛЬ", "ТВОЙ КОМПАНЬОН", "ТВОИ ИНТЕРЕСЫ"];
const companionNames = {
  owl: "Сова",
  cat: "Кот",
  fox: "Лисёнок",
  bunny: "Кролик",
  bear: "Медвежонок",
  deer: "Оленёнок"
};

function showStep(step) {
  currentStep = step;

  steps.forEach((panel, index) => {
    panel.classList.toggle("active", index === step);
  });

  if (step < 3) {
    stepLabel.textContent = `ШАГ 0${step + 1} / 03`;
    stepCaption.textContent = stepNames[step];
    progressFill.style.width = `${((step + 1) / 3) * 100}%`;
    formActions.classList.remove("hidden");
    finishButton.classList.add("hidden");
    formFootnote.classList.remove("hidden");
    backButton.disabled = step === 0;
    nextButton.innerHTML = step === 2 ? 'Завершить <span>→</span>' : 'Продолжить <span>→</span>';
  } else {
    stepLabel.textContent = "ГОТОВО";
    stepCaption.textContent = "ТВОЁ ПРОСТРАНСТВО";
    progressFill.style.width = "100%";
    formActions.classList.add("hidden");
    finishButton.classList.remove("hidden");
    formFootnote.classList.add("hidden");
    updateCompletion();
  }
}

function validateCurrentStep() {
  if (currentStep === 0) {
    const name = nameInput.value.trim();
    const error = document.getElementById("name-error");
    if (!name) {
      error.textContent = "Напиши, как к тебе обращаться.";
      nameInput.focus();
      return false;
    }
    error.textContent = "";
  }

  if (currentStep === 1 && !selectedCompanion) {
    document.getElementById("companion-error").textContent = "Сначала выбери своего компаньона.";
    return false;
  }

  return true;
}

nextButton.addEventListener("click", () => {
  if (!validateCurrentStep()) return;

  if (currentStep === 2) {
    saveProfile();
    showStep(3);
  } else {
    showStep(currentStep + 1);
  }
});

backButton.addEventListener("click", () => {
  if (currentStep > 0) showStep(currentStep - 1);
});

nameInput.addEventListener("input", () => {
  document.getElementById("name-error").textContent = "";
});

avatarInput.addEventListener("change", () => {
  const file = avatarInput.files && avatarInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) return;
  if (file.size > 5 * 1024 * 1024) {
    alert("Выбери изображение размером до 5 МБ.");
    avatarInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    avatarData = reader.result;
    avatarPreview.src = avatarData;
    avatarPreview.hidden = false;
    avatarPlaceholder.hidden = true;
  };
  reader.readAsDataURL(file);
});

document.querySelectorAll(".companion-card").forEach((card) => {
  card.addEventListener("click", () => {
    selectedCompanion = card.dataset.companion;

    document.querySelectorAll(".companion-card").forEach((item) => {
      const isSelected = item === card;
      item.classList.toggle("selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });

    document.getElementById("companion-error").textContent = "";
  });
});

document.querySelectorAll(".interest-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const interest = chip.dataset.interest;
    const isSelected = selectedInterests.includes(interest);

    if (isSelected) {
      selectedInterests = selectedInterests.filter((item) => item !== interest);
    } else {
      selectedInterests.push(interest);
    }

    chip.classList.toggle("selected", !isSelected);
    chip.setAttribute("aria-pressed", String(!isSelected));
    document.getElementById("interest-count").textContent = selectedInterests.length;
  });
});

function saveProfile() {
  const profile = {
    name: nameInput.value.trim(),
    about: aboutInput.value.trim(),
    avatar: avatarData,
    companion: selectedCompanion,
    companionName: companionNameInput.value.trim(),
    interests: selectedInterests
  };

  try {
    localStorage.setItem("aftertoneProfile", JSON.stringify(profile));
  } catch (error) {
  
    profile.avatar = "";
    localStorage.setItem("aftertoneProfile", JSON.stringify(profile));
  }
}

function updateCompletion() {
  const name = nameInput.value.trim();
  document.getElementById("completion-initial").textContent = name.charAt(0).toUpperCase() || "А";
  document.getElementById("completion-copy").textContent =
    `${name}, твоё пространство готово. Здесь будет место для историй, к которым захочется возвращаться.`;

  const companion = companionNames[selectedCompanion] || "Твой компаньон";
  document.getElementById("summary-companion").textContent = companion;

  const customName = companionNameInput.value.trim();
  document.getElementById("summary-companion-name").textContent =
    customName ? `Теперь его зовут ${customName}.` : "Будет рядом с тобой.";
}

finishButton.addEventListener("click", async () => {
  saveProfile();
  finishButton.disabled = true;
  try {
    // имя, «о себе» и интересы сохраняются на сервере; компаньон и аватар — в этом браузере
    await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ displayName: nameInput.value.trim(), bio: aboutInput.value.trim(), interests: selectedInterests })
    });
  } catch (error) {
    /* без сети профиль всё равно сохранён локально */
  }
  try { await AT.pushPrefs(); } catch (error) { /* локальная копия уже есть */ }
  window.location.href = "dashboard.html";
});


showStep(0);
