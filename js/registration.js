import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, firebaseReady, persistenceReady } from "./firebase-client.js";
import { createProfileImageDataUrl } from "./profile-image.js";

const registrationForm = document.querySelector('.registration-form');
const formMessage = document.querySelector('.form-message');
const registrationSteps = Array.from(document.querySelectorAll('.registration-step'));
const progressCount = document.querySelector('.progress-count');
const progressValue = document.querySelector('.progress-value');
const registrationFooter = document.querySelector('.registration-footer');
const registrationToast = document.querySelector('.registration-toast');
const registrationToastMessage = registrationToast?.querySelector('.registration-toast-message');
const registrationToastClose = registrationToast?.querySelector('.registration-toast-close');
const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const avatarInput = registrationForm?.elements.namedItem('avatar');
const photoPreview = document.querySelector('.photo-preview');
let toastTimeout;
let toastAnimationTimeout;
let registrationInProgress = false;

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

const hideRegistrationToast = () => {
  if (!(registrationToast instanceof HTMLElement)) return;

  window.clearTimeout(toastTimeout);
  registrationToast.classList.add('is-leaving');
  toastAnimationTimeout = window.setTimeout(() => {
    registrationToast.hidden = true;
    registrationToast.classList.remove('is-leaving');
  }, 200);
};

const showRegistrationToast = (message) => {
  if (!(registrationToast instanceof HTMLElement) ||
      !(registrationToastMessage instanceof HTMLElement)) return;

  window.clearTimeout(toastTimeout);
  window.clearTimeout(toastAnimationTimeout);
  registrationToastMessage.textContent = message;
  registrationToast.hidden = false;
  registrationToast.classList.remove('is-leaving');
  toastTimeout = window.setTimeout(hideRegistrationToast, 2000);
};

registrationToastClose?.addEventListener('click', hideRegistrationToast);

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('vkt-theme', nextTheme);
  updateThemeToggle(nextTheme);
});

['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
  });
});

registrationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!(formMessage instanceof HTMLElement)) {
    return;
  }

  if (!firebaseReady || !auth || !db) {
    formMessage.textContent = 'Подключи настройки Firebase в файле js/firebase-config.js.';
    formMessage.classList.add('is-error');
    return;
  }

  const readField = (name) => registrationForm.querySelector(`[name="${name}"]`);
  const firstNameField = readField('firstName');
  const lastNameField = readField('lastName');
  const emailField = readField('email');
  const passwordField = readField('password');
  const nicknameField = readField('nickname');
  const avatarField = readField('avatar');
  if (![firstNameField, lastNameField, emailField, passwordField, nicknameField]
    .every((field) => field instanceof HTMLInputElement)) {
    formMessage.textContent = 'Не удалось прочитать поля формы. Перезагрузи страницу и попробуй снова.';
    formMessage.classList.add('is-error');
    return;
  }
  if (!(avatarField instanceof HTMLInputElement)) {
    formMessage.textContent = 'Не удалось прочитать фотографию профиля. Перезагрузи страницу и попробуй снова.';
    formMessage.classList.add('is-error');
    return;
  }

  const avatarFile = avatarField.files?.[0] || null;
  if (avatarFile && (!avatarFile.type.startsWith('image/') || avatarFile.size >= 5 * 1024 * 1024)) {
    formMessage.textContent = 'Выбери изображение размером не более 5 МБ.';
    formMessage.classList.add('is-error');
    return;
  }

  registrationInProgress = true;
  const submitButton = registrationForm.querySelector('button[type="submit"]');
  const firstName = firstNameField.value.trim();
  const lastName = lastNameField.value.trim();
  const email = emailField.value.trim();
  const nickname = nicknameField.value.trim();
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
    submitButton.textContent = 'Создаём аккаунт…';
  }

  formMessage.textContent = '';
  formMessage.classList.remove('is-error');

  try {
    await persistenceReady;
    const avatarDataUrl = avatarFile ? await createProfileImageDataUrl(avatarFile) : null;
    const credential = await createUserWithEmailAndPassword(auth, email, passwordField.value);

    try {
      await updateProfile(credential.user, { displayName: `${firstName} ${lastName}` });
      const profile = {
        firstName,
        lastName,
        nickname,
        email: credential.user.email,
        createdAt: serverTimestamp()
      };
      if (avatarDataUrl) profile.avatarDataUrl = avatarDataUrl;
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', credential.user.uid), profile);
      const publicProfile = {
        firstName,
        lastName,
        nickname,
        updatedAt: serverTimestamp()
      };
      if (avatarDataUrl) publicProfile.avatarDataUrl = avatarDataUrl;
      batch.set(doc(db, 'publicProfiles', credential.user.uid), publicProfile);
      await batch.commit();
    } catch (error) {
      formMessage.textContent = `Аккаунт создан, но профиль не сохранён: ${getRegistrationError(error)}. Проверь правила Firestore.`;
      formMessage.classList.add('is-error');
      return;
    }

    window.location.replace('site.html?view=feed');
  } catch (error) {
    registrationInProgress = false;
    formMessage.textContent = getRegistrationError(error);
    formMessage.classList.add('is-error');
  } finally {
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
      submitButton.textContent = 'Завершить регистрацию';
    }
  }
});

function getRegistrationError(error) {
  const messages = {
    'auth/email-already-in-use': 'Этот адрес электронной почты уже зарегистрирован.',
    'auth/invalid-email': 'Проверь адрес электронной почты.',
    'auth/weak-password': 'Пароль слишком простой. Используй не менее 8 символов.',
    'auth/operation-not-allowed': 'В Firebase Console включи вход по электронной почте и паролю.',
    'auth/network-request-failed': 'Нет соединения. Проверь интернет и попробуй снова.',
    'permission-denied': 'Firebase запретил запись профиля. Проверь правила Firestore.',
    'unavailable': 'Firebase временно недоступен. Попробуй позже.'
  };
  return messages[error?.code] || 'Не удалось завершить регистрацию. Проверь настройки Firebase и попробуй снова.';
}

if (!firebaseReady) {
  showRegistrationToast('Настрой Firebase: открой js/firebase-config.js.');
} else {
  onAuthStateChanged(auth, (user) => {
    if (user && !registrationInProgress) window.location.replace('site.html?view=feed');
  });
}

const showStep = (stepIndex) => {
  registrationSteps.forEach((step, index) => {
    const isActive = index === stepIndex;
    step.hidden = !isActive;
    step.disabled = !isActive;
  });

  if (progressCount instanceof HTMLElement) {
    progressCount.textContent = `Шаг ${stepIndex + 1} из ${registrationSteps.length}`;
  }
  if (progressValue instanceof HTMLElement) {
    progressValue.style.width = `${((stepIndex + 1) / registrationSteps.length) * 100}%`;
  }
  if (registrationFooter instanceof HTMLElement) {
    registrationFooter.hidden = stepIndex !== 0;
  }
  if (formMessage instanceof HTMLElement) {
    formMessage.textContent = '';
    formMessage.classList.remove('is-error');
  }
};

document.querySelectorAll('.step-next').forEach((button, stepIndex) => {
  button.addEventListener('click', () => {
    const currentStep = registrationSteps[stepIndex];
    if (!(currentStep instanceof HTMLFieldSetElement)) return;

    const requiredFields = Array.from(currentStep.querySelectorAll('input[required]'));
    const hasEmptyField = requiredFields.some((field) => {
      return field instanceof HTMLInputElement && field.value.trim() === '';
    });

    if (hasEmptyField) {
      showRegistrationToast('Заполни все поля, прежде чем продолжить');
      return;
    }

    if (!currentStep.reportValidity()) return;
    showStep(stepIndex + 1);
  });
});

document.querySelectorAll('.step-back').forEach((button) => {
  button.addEventListener('click', () => {
    const currentStep = button.closest('.registration-step');
    const currentIndex = Number(currentStep?.dataset.step);
    if (Number.isInteger(currentIndex) && currentIndex > 0) showStep(currentIndex - 1);
  });
});

avatarInput?.addEventListener('change', () => {
  if (!(avatarInput instanceof HTMLInputElement) ||
      !(photoPreview instanceof HTMLElement) ||
      !avatarInput.files?.[0]) return;

  const imageUrl = URL.createObjectURL(avatarInput.files[0]);
  photoPreview.replaceChildren();
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = 'Предпросмотр фотографии профиля';
  image.addEventListener('load', () => URL.revokeObjectURL(imageUrl), { once: true });
  photoPreview.append(image);
});