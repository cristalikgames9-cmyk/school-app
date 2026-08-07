(async function () {
  const grid = document.getElementById('subjectsGrid');

  // 1. Проверяем авторизацию
  const authData = await checkAuth();

  if (authData) {
    const subtitle = document.getElementById('welcomeSubtitle');
    if (subtitle) subtitle.textContent = 'Привет, ' + authData.user.username + '! Продолжай обучение.';

    const progressBox = document.getElementById('userProgressBox');
    if (progressBox) {
      progressBox.style.display = 'block';
      document.getElementById('progressText').textContent = authData.progress.completed + ' из ' + authData.progress.total + ' уроков решено';
      document.getElementById('progressBar').style.width = authData.progress.percent + '%';
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