const primaryButtons = document.querySelectorAll('.primary-btn, .secondary-btn, .ghost-btn');

const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const savedTheme = localStorage.getItem('vkt-theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';

document.documentElement.dataset.theme = initialTheme;

if (themeToggle && themeIcon) {
  const updateThemeToggle = (theme) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const actionLabel = nextTheme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему';

    themeToggle.setAttribute('aria-label', actionLabel);
    themeToggle.title = actionLabel;
    themeIcon.textContent = nextTheme === 'dark' ? '☾' : '☀';
  };

  updateThemeToggle(initialTheme);

  themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('vkt-theme', nextTheme);
    updateThemeToggle(nextTheme);
  });
}

['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

primaryButtons.forEach((button) => {
  button.addEventListener('click', () => {
    button.animate(
      [
        { transform: 'translateY(0px) scale(1)' },
        { transform: 'translateY(-2px) scale(1.01)' },
        { transform: 'translateY(0px) scale(1)' }
      ],
      {
        duration: 240,
        easing: 'ease-out'
      }
    );
  });
});

document.querySelectorAll('.device-link').forEach((link) => {
  link.addEventListener('click', (event) => {
    const downloadUrl = link.dataset.downloadUrl.trim();
    if (!downloadUrl) {
      event.preventDefault();
      window.alert('Ссылка на скачивание будет добавлена позже.');
      return;
    }

    link.href = downloadUrl;
  });
});
