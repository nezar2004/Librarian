import { translate } from "./library-language.js";
let lastMessage = "";
document.addEventListener("library:language", () => {
  document.getElementById("login-status").textContent = translate(lastMessage);
});

export function showLoginStatus(message, state) {
  const status = document.getElementById("login-status");
  lastMessage = message;
  status.textContent = translate(message);
  status.dataset.state = state;
}

export function initLogin(authenticate, resetPassword) {
  const form = document.getElementById("login-form");
  const email = form.querySelector('input[type="email"]');
  const password = form.querySelector('[autocomplete="current-password"]');
  const toggle = document.getElementById("toggle-password");
  const submit = form.querySelector('button[type="submit"]');
  const reset = document.getElementById("reset-password");
  let pending = false;

  async function run(action, message) {
    if (pending) return;
    pending = true;
    submit.disabled = true;
    if (reset) reset.disabled = true;
    showLoginStatus(message, "pending");
    try {
      await action();
    } finally {
      pending = false;
      submit.disabled = false;
      if (reset) reset.disabled = false;
    }
  }

  document.addEventListener("library:language", () => {
    toggle.textContent = translate(password.type === "password" ? "إظهار" : "إخفاء");
  });
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    toggle.textContent = translate(visible ? "إخفاء" : "إظهار");
    toggle.setAttribute("aria-pressed", String(visible));
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    void run(authenticate, "جاري تسجيل الدخول…");
  });
  submit.disabled = false;
  if (reset && resetPassword) {
    reset.disabled = false;
    reset.addEventListener("click", () => {
      if (email.reportValidity()) void run(resetPassword, "جاري طلب رابط إعادة التعيين…");
    });
  }
}
