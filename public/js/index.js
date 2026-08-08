document.addEventListener('DOMContentLoaded', async () => {
  const subjectsList = document.getElementById('subjectsList');
  const userNameEl = document.getElementById('userName');
  const welcomeText = document.getElementById('welcomeText');
  const progressBox = document.getElementById('progressBox');
  const progressText = document.getElementById('progressText');
  const logoutBtn = document.getElementById('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/login.html';
    });
  }

  try {
    // 1. Проверяем, авторизован ли пользователь, и берём его прогресс
    const authRes = await fetch('/api/auth/me');
    const authData = await authRes.json();

    if (!authData.user) {
      window.location.href = '/login.html';
      return;
    }

    if (userNameEl) userNameEl.textContent = `👋 ${authData.user.username}`;
    if (welcomeText) welcomeText.textContent = `Привет, ${authData.user.username}!`;

    if (progressBox && progressText && authData.totalLessons > 0) {
      const pct = Math.round((authData.completedLessons / authData.totalLessons) * 100);
      progressText.textContent = `${authData.completedLessons} из ${authData.totalLessons} уроков пройдено (${pct}%)`;
      progressBox.style.display = 'block';
    }

    // 2. Загружаем предметы
    const subjectsRes = await fetch('/api/subjects');
    const subjects = await subjectsRes.json();

    if (!subjectsList) return;

    if (!subjects || subjects.length === 0) {
      subjectsList.innerHTML = '<p>Предметы не найдены.</p>';
      return;
    }

    subjectsList.innerHTML = subjects
      .map((s) => `
      <a href="/subject.html?id=${s.id}" class="subject-card">
        <h3>${s.title || s.name}</h3>
        <p>${s.description || ''}</p>
      </a>
    `)
      .join('');
  } catch (err) {
    console.error('Ошибка загрузки главной страницы:', err);
    if (subjectsList) subjectsList.innerHTML = '<p style="color:red">Ошибка загрузки.</p>';
  }
});
