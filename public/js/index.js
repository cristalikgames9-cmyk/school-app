(async function () {
  const grid = document.getElementById('subjectsGrid');
  const userProfile = document.getElementById('userProfile');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const loginBtn = document.getElementById('loginBtn');

  // 1. Проверяем авторизацию пользователя
  try {
    const authData = await checkAuth();

    if (authData && authData.user) {
      // Обновляем шапку
      if (userProfile && usernameDisplay) {
        usernameDisplay.textContent = authData.user.username;
        userProfile.style.display = 'inline-flex';
      }

      // Генерация динамического заглавного приветствия
      const titleEl = document.getElementById('welcomeTitle');
      if (titleEl) {
        titleEl.textContent = getRandomGreeting(authData.user.username);
      }

      // Заполнение и отображение бара прогресса
      const progressBox = document.getElementById('userProgressBox');
      if (progressBox && authData.progress) {
        progressBox.style.display = 'block';

        const completed = authData.progress.completed || 0;
        const total = authData.progress.total || 0;
        const percent = authData.progress.percent || 0;

        const textEl = document.getElementById('progressText');
        const percentEl = document.getElementById('progressPercent');
        const barEl = document.getElementById('progressBar');

        if (textEl) textEl.textContent = `${completed} из ${total} уроков пройдено`;
        if (percentEl) percentEl.textContent = `${percent}%`;
        if (barEl) barEl.style.width = `${percent}%`;
      }
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-block';
    }
  } catch (err) {
    console.log('Пользователь не авторизован');
    if (loginBtn) loginBtn.style.display = 'inline-block';
  }

  // 2. Загружаем предметы из API
  try {
    const subjects = await api('/subjects');

    if (!subjects || subjects.length === 0) {
      if (grid) grid.innerHTML = '<div class="empty-state">Предметы не найдены</div>';
      return;
    }

    if (grid) {
      grid.innerHTML = subjects
        .map(s => `
          <a class="cover-card" style="--accent:${s.color}" href="/subject.html?id=${s.id}">
            <div class="sticker">${s.icon}</div>
            <span class="tag">1 класс</span>
            <h3>${s.title}</h3>
          </a>
        `)
        .join('');
    }
  } catch (e) {
    console.error('Ошибка загрузки предметов:', e);
    if (grid) grid.innerHTML = '<div class="empty-state">Ошибка загрузки предметов</div>';
  }
})();

// Рандомные варианты приветствия
function getRandomGreeting(username) {
  const greetings = [
    `Пора учиться, ${username}!`,
    `Привет, ${username}!`,
    `С возвращением, ${username}!`,
    `Отличный день для уроков, ${username}!`,
    `Продолжай в том же духе, ${username}!`
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}