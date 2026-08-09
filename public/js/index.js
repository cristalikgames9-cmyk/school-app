document.addEventListener('DOMContentLoaded', async () => {
  const subjectsList = document.getElementById('subjectsList');
  const userNameEl = document.getElementById('userName');
  const welcomeText = document.getElementById('welcomeText');
  const progressBox = document.getElementById('progressBox');
  const progressText = document.getElementById('progressText');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginBtn = document.getElementById('loginBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => {});
      // После выхода остаёмся на главной как гость, а не улетаем на /login.html
      window.location.href = '/index.html';
    });
  }

  try {
    // cache: 'no-store' — критично: без этого браузер иногда отдаёт
    // закэшированный "гостевой" ответ сразу после логина/регистрации,
    // из-за чего на миг мелькает неавторизованное состояние.
    const authRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const authData = await authRes.json();

    if (authData.user) {
      if (userNameEl) userNameEl.textContent = `👋 ${authData.user.username}`;
      if (welcomeText) welcomeText.textContent = `Привет, ${authData.user.username}!`;
      if (logoutBtn) logoutBtn.style.display = '';
      if (loginBtn) loginBtn.style.display = 'none';

      if (progressBox && progressText && authData.totalLessons > 0) {
        const pct = Math.round((authData.completedLessons / authData.totalLessons) * 100);
        progressText.textContent = `${authData.completedLessons} из ${authData.totalLessons} уроков пройдено (${pct}%)`;
        progressBox.style.display = 'block';
      }
    } else {
      // Гость: не редиректим, просто показываем кнопку "Войти" вместо ника
      if (userNameEl) userNameEl.textContent = '👋 Гость';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (loginBtn) loginBtn.style.display = '';
      if (progressBox) progressBox.style.display = 'none';
    }

    // Предметы видны всем — и гостям, и авторизованным.
    // При клике на предмет неавторизованного пользователя subject.js
    // сам отправит на страницу входа.
    const subjectsRes = await fetch('/api/subjects', { cache: 'no-store' });
    const subjects = await subjectsRes.json();

    if (!subjectsList) return;

    if (!subjects || subjects.length === 0) {
      subjectsList.innerHTML = '<p>Предметы не найдены.</p>';
      return;
    }

    subjectsList.innerHTML = subjects
      .map(
        (s) => `
      <a href="/subject.html?id=${s.id}" class="subject-card">
        <h3>${s.title || s.name}</h3>
        <p>${s.description || ''}</p>
      </a>
    `
      )
      .join('');
  } catch (err) {
    console.error('Ошибка загрузки главной страницы:', err);
    if (subjectsList) subjectsList.innerHTML = '<p style="color:red">Ошибка загрузки.</p>';
  }
});
