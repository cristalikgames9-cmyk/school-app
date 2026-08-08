document.addEventListener('DOMContentLoaded', async () => {
  // Используем точные ID из твоего index.html
  const subjectsList = document.getElementById('subjectsList');
  const userNameEl = document.getElementById('userName');

  try {
    // 1. Проверяем, авторизован ли пользователь
    const authRes = await fetch('/api/auth/me');
    const authData = await authRes.json();

    if (!authData.user) {
      // Если пользователя нет, перекидываем на твой файл авторизации
      window.location.href = '/login.html';
      return;
    }

    // Если авторизован, подставляем имя
    if (userNameEl) {
      userNameEl.textContent = `👋 ${authData.user.username}`;
    }

    // 2. Загружаем предметы
    const res = await fetch('/api/subjects');
    const subjects = await res.json();

    if (!subjectsList) return;

    if (!subjects || subjects.length === 0) {
      subjectsList.innerHTML = '<p>Предметы не найдены.</p>';
      return;
    }

    // Вставляем карточки, сохраняя твои оригинальные классы (subject-card)
    subjectsList.innerHTML = subjects.map(s => `
      <a href="/subject.html?id=${s.id}" class="subject-card">
        <h3>${s.title || s.name}</h3>
        <p>${s.description || ''}</p>
      </a>
    `).join('');
  } catch (err) {
    console.error('Ошибка загрузки главной страницы:', err);
    if (subjectsList) subjectsList.innerHTML = '<p style="color:red">Ошибка загрузки.</p>';
  }
});