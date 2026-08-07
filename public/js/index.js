(async function () {
  const grid = document.getElementById('subjectsGrid');

  // 1. Проверяем авторизацию
  const authData = await checkAuth();

  if (authData && authData.user) {
    // Случайные фразы приветствия
    const welcomeTitle = document.getElementById('welcomeTitle');
    if (welcomeTitle) {
      welcomeTitle.textContent = getRandomGreeting(authData.user.username);
    }

    // Обновление шкалы и текста прогресса
    const progressBox = document.getElementById('userProgressBox');
    if (progressBox) {
      progressBox.style.display = 'block';

      const completed = authData.progress.completed || 0;
      const total = authData.progress.total || 0;
      const percent = authData.progress.percent || 0;

      const progressText = document.getElementById('progressText');
      if (progressText) {
        progressText.textContent = `${completed} из ${total} уроков решено`;
      }

      const progressPercent = document.getElementById('progressPercent');
      if (progressPercent) {
        progressPercent.textContent = `${percent}%`;
      }

      const progressBar = document.getElementById('progressBar');
      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
    }
  }

  // 2. Загружаем предметы
  try {
    const subjects = await api('/subjects');
    if (!subjects || subjects.length === 0) {
      if (grid) grid.innerHTML = '<div class="empty-state">Предметы не найдены 😕</div>';
      return;
    }

    if (grid) {
      grid.innerHTML = subjects
        .map(function (s) {
          return '<a class="cover-card" style="--accent:' + s.color + '" href="/subject.html?id=' + s.id + '">' +
            '<div class="sticker">' + s.icon + '</div>' +
            '<span class="tag">1 класс</span>' +
            '<h3>' + s.title + '</h3>' +
          '</a>';
        })
        .join('');
    }
  } catch (e) {
    console.error('Ошибка загрузки предметов:', e);
    if (grid) {
      grid.innerHTML = '<div class="empty-state">Не получилось загрузить предметы 😕</div>';
    }
  }
})();

// Функция генерации рандомного приветствия
function getRandomGreeting(username) {
  const greetings = [
    `Пора учиться, ${username}! 🚀`,
    `Привет, ${username}! 👋`,
    `С возвращением, ${username}! 📚`,
    `Отличный день для уроков, ${username}! ✨`,
    `Продолжай в том же духе, ${username}! 💪`
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}