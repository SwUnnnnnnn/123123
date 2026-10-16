import {
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, firebaseReady, persistenceReady } from "./firebase-client.js";

const authorizationForm = document.querySelector('.authorization-form');
const authorizationToast = document.querySelector('.authorization-toast');
const authorizationToastMessage = authorizationToast?.querySelector('.authorization-toast-message');
const authorizationToastClose = authorizationToast?.querySelector('.authorization-toast-close');
const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const recoveryButton = document.querySelector('.recovery-button');

const savedTheme = localStorage.getItem('vkt-theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = initialTheme;

const updateThemeToggle = (theme) => {
  if (!themeToggle || !themeIcon) return;

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const actionLabel = nextTheme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему';
  themeToggle.setAttribute('aria-label', actionLabel);
  themeToggle.title = actionLabel;
  themeIcon.textContent = nextTheme === 'dark' ? '☾' : '☀';
};

updateThemeToggle(initialTheme);

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('vkt-theme', nextTheme);
  updateThemeToggle(nextTheme);
});

let toastTimeout;
let toastAnimationTimeout;

const hideToast = () => {
  if (!(authorizationToast instanceof HTMLElement)) return;

  window.clearTimeout(toastTimeout);
  authorizationToast.classList.add('is-leaving');
  toastAnimationTimeout = window.setTimeout(() => {
    authorizationToast.hidden = true;
    authorizationToast.classList.remove('is-leaving');
  }, 200);
};

const showToast = (message) => {
  if (!(authorizationToast instanceof HTMLElement) ||
      !(authorizationToastMessage instanceof HTMLElement)) return;

  window.clearTimeout(toastTimeout);
  window.clearTimeout(toastAnimationTimeout);
  authorizationToastMessage.textContent = message;
  authorizationToast.hidden = false;
  authorizationToast.classList.remove('is-leaving');
  toastTimeout = window.setTimeout(hideToast, 3000);
};

authorizationToastClose?.addEventListener('click', hideToast);

authorizationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!firebaseReady || !auth) {
    showToast('Подключи настройки Firebase в файле js/firebase-config.js.');
    return;
  }

  const submitButton = authorizationForm.querySelector('button[type="submit"]');
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
    submitButton.textContent = 'Входим…';
  }

  const formData = new FormData(authorizationForm);
  try {
    await persistenceReady;
    await signInWithEmailAndPassword(
      auth,
      String(formData.get('email')).trim(),
      String(formData.get('password'))
    );
    window.location.replace('site.html?view=feed');
  } catch (error) {
    const messages = {
      'auth/invalid-credential': 'Почта или пароль указаны неверно.',
      'auth/user-not-found': 'Аккаунт с такой почтой не найден.',
      'auth/wrong-password': 'Почта или пароль указаны неверно.',
      'auth/invalid-email': 'Проверь адрес электронной почты.',
      'auth/too-many-requests': 'Слишком много попыток. Попробуй позже.',
      'auth/network-request-failed': 'Нет соединения. Проверь интернет и попробуй снова.'
    };
    showToast(messages[error?.code] || 'Не удалось войти. Проверь настройки Firebase и попробуй снова.');
  } finally {
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
      submitButton.textContent = 'Войти';
    }
  }
});

if (!firebaseReady) {
  showToast('Настрой Firebase: открой js/firebase-config.js.');
} else {
  onAuthStateChanged(auth, (user) => {
    if (user) window.location.replace('site.html?view=feed');
  });
}

recoveryButton?.addEventListener('click', () => {
  showToast('Восстановление пароля пока не подключено.');
});

['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
  });
});