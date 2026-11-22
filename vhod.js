const form = document.getElementById("auth-form");
const panel = document.getElementById("form-panel");

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");

const title = document.getElementById("form-title");
const subtitle = document.getElementById("form-subtitle");
const symbolCaption = document.getElementById("symbol-caption");

const fieldName = document.getElementById("field-name");
const fieldAge = document.getElementById("field-age");
const inputAge = document.getElementById("input-age");
const fieldEmail = document.getElementById("field-email");
const fieldPassword = document.getElementById("field-password");
const fieldConfirm = document.getElementById("field-confirm");

const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const inputPassword = document.getElementById("input-password");
const inputConfirm = document.getElementById("input-confirm");

const forgotRow = document.getElementById("forgot-row");
const submitLabel = document.getElementById("submit-label");
const switchPrompt = document.getElementById("switch-prompt");
const switchButton = document.getElementById("switch-to-signup");
const statusMessage = document.getElementById("form-status");
const switchText = document.getElementById("switch-text");

let currentMode = "login";


function setMode(mode) {
  currentMode = mode;

  const isSignup = mode === "signup";

  panel.classList.toggle("mode-signup", isSignup);
  panel.classList.toggle("mode-login", !isSignup);

  tabLogin.classList.toggle("active", !isSignup);
  tabSignup.classList.toggle("active", isSignup);

  tabLogin.setAttribute("aria-pressed", String(!isSignup));
  tabSignup.setAttribute("aria-pressed", String(isSignup));

  fieldName.classList.toggle("hidden", !isSignup);
  fieldConfirm.classList.toggle("hidden", !isSignup);
  fieldAge.classList.toggle("hidden", !isSignup);
  forgotRow.classList.toggle("hidden", isSignup);

  document.getElementById("hint-password").classList.toggle("hidden", !isSignup);

  if (isSignup) {
    title.textContent = "Создадим твоё место?";
    subtitle.textContent = "Всего пара шагов — и можно сохранять моменты.";
    symbolCaption.textContent = "начни свою историю";
    submitLabel.textContent = "Создать аккаунт";
    switchText.textContent = "Уже есть аккаунт?";
    switchButton.textContent = "Войти";
    switchButton.id = "switch-to-login";

    inputName.required = true;
    inputConfirm.required = true;
    inputPassword.autocomplete = "new-password";
  } else {
    title.textContent = "С возвращением!";
    subtitle.textContent = "Твоя история продолжается здесь.";
    symbolCaption.textContent = "как хорошо, что ты здесь";
    submitLabel.textContent = "Войти";
    switchText.textContent = "Впервые здесь?";
    switchButton.textContent = "Создать аккаунт";
    switchButton.id = "switch-to-signup";

    inputName.required = false;
    inputConfirm.required = false;
    inputPassword.autocomplete = "current-password";
  }

  clearErrors();
  statusMessage.classList.add("hidden");
  form.reset();

  document.querySelectorAll(".eye-button").forEach((button) => {
    const input = document.getElementById(button.dataset.target);
    const closedIcon = button.querySelector(".icon-eye-closed");
    const openIcon = button.querySelector(".icon-eye-open");

    input.type = "password";
    closedIcon.classList.remove("hidden");
    openIcon.classList.add("hidden");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Показать пароль");
  });
}

tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

switchPrompt.addEventListener("click", (event) => {
  if (event.target.id === "switch-to-signup") {
    setMode("signup");
  } else if (event.target.id === "switch-to-login") {
    setMode("login");
  }
});


document.querySelectorAll(".eye-button").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    const closedIcon = button.querySelector(".icon-eye-closed");
    const openIcon = button.querySelector(".icon-eye-open");

    const isHidden = input.type === "password";

    input.type = isHidden ? "text" : "password";

    closedIcon.classList.toggle("hidden", isHidden);
    openIcon.classList.toggle("hidden", !isHidden);

    button.setAttribute("aria-pressed", String(isHidden));
    button.setAttribute(
      "aria-label",
      isHidden ? "Скрыть пароль" : "Показать пароль"
    );
  });
});


function showError(field, input, message) {
  const error = document.getElementById(`error-${input.name}`);

  field.classList.add("field-error");
  error.textContent = message;
  error.classList.remove("hidden");
}

function clearFieldError(field, input) {
  const error = document.getElementById(`error-${input.name}`);

  field.classList.remove("field-error");
  error.textContent = "";
  error.classList.add("hidden");
}

function clearErrors() {
  [
    [fieldName, inputName],
    [fieldAge, inputAge],
    [fieldEmail, inputEmail],
    [fieldPassword, inputPassword],
    [fieldConfirm, inputConfirm]
  ].forEach(([field, input]) => clearFieldError(field, input));
}

function validateForm() {
  clearErrors();

  let valid = true;

  if (currentMode === "signup" && !inputConfirm.value) {
    showError(fieldConfirm, inputConfirm, "Повтори пароль.");
    valid = false;
  } else if (
    currentMode === "signup" &&
    inputConfirm.value !== inputPassword.value
  ) {
    showError(fieldConfirm, inputConfirm, "Пароли не совпадают. Проверь оба поля.");
    valid = false;
  }

  const email = inputEmail.value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!email) {
    showError(fieldEmail, inputEmail, "Введи электронную почту.");
    valid = false;
  } else if (!emailPattern.test(email)) {
    showError(fieldEmail, inputEmail, "Проверь адрес почты. Например, max@gmail.com.");
    valid = false;
  }

  if (!inputPassword.value) {
    showError(fieldPassword, inputPassword, "Введи пароль.");
    valid = false;
  } else if (currentMode === "signup" && inputPassword.value.length < 8) {
    showError(fieldPassword, inputPassword, "Пароль должен содержать не менее 8 символов.");
    valid = false;
  }

  if (
    currentMode === "signup" &&
    inputConfirm.value !== inputPassword.value
  ) {
    showError(fieldConfirm, inputConfirm, "Пароли не совпадают. Проверь оба поля.");
    valid = false;
  } else if (currentMode === "signup" && !inputConfirm.value) {
    showError(fieldConfirm, inputConfirm, "Повтори пароль.");
    valid = false;
  }

  return valid;
}


[
  [fieldName, inputName],
  [fieldEmail, inputEmail],
  [fieldPassword, inputPassword],
  [fieldConfirm, inputConfirm]
].forEach(([field, input]) => {
  input.addEventListener("input", () => {
    clearFieldError(field, input);
    statusMessage.classList.add("hidden");
  });
});


form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusMessage.classList.add("hidden");
  if (!validateForm()) return;

  const signup = currentMode === "signup";
  const age = Number(inputAge.value);
  if (signup && !(Number.isInteger(age) && age >= 8 && age <= 110)) {
    showError(fieldAge, inputAge, "Укажи возраст числом.");
    return;
  }

  const button = document.getElementById("submit-button");
  button.disabled = true;
  try {
    const body = { email: inputEmail.value.trim(), password: inputPassword.value };
    if (signup) Object.assign(body, { displayName: inputName.value.trim(), age, interests: [] });
    const response = await fetch(`/api/auth/${signup ? "register" : "login"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Что-то пошло не так. Попробуй ещё раз.");
    localStorage.setItem("aftertone_token", data.token);
    location.href = signup ? "onboarding.html" : "dashboard.html";
  } catch (error) {
    statusMessage.classList.remove("hidden", "demo-notice");
    statusMessage.textContent = error.message === "Failed to fetch" ? "Сервер недоступен. Запущен ли бэкенд?" : error.message;
  } finally {
    button.disabled = false;
  }
});


document.getElementById("btn-forgot").addEventListener("click", () => {
  statusMessage.classList.remove("hidden");
  statusMessage.classList.add("demo-notice");
  statusMessage.innerHTML =
    "<span>Восстановление пароля</span> Эта функция станет доступна после подключения системы аккаунтов.";
});


setMode("login");