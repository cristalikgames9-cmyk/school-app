(async function () {
  try {
    // 1. Проверка авторизации
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const { user } = await meRes.json();
      const userNameEl = document.getElementById('userName');
      const welcomeEl = document.getElementById('welcomeText');
      if (userNameEl) userNameEl.textContent = `👋 ${user.username}`;
      if (welcomeEl) welcomeEl.textContent = `Привет, ${user.username}!`;
    }

    // 2. Загрузка списка предметов
    const res = await fetch('/api/subjects');
    if (!res.ok) throw new Error('Ошибка загрузки');
    const subjects = await res.json();

    const gridEl = document.getElementById('subjectsList');
    if (!gridEl) return;

    if (!subjects || subjects.length === 0) {
      gridEl.innerHTML = '<p class="subtitle">Предметы пока не добавлены</p>';
      return;
    }

    // Рендерим карточки с правильными классами для CSS
    gridEl.innerHTML = subjects
      .map(
        (s) => `
        <a href="/subject.html?id=${s.id}" class="subject-card">
          <div style="font-size: 32px; margin-bottom: 8px;">${s.icon || '📚'}</div>
          <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${s.title}</h3>
          <span style="font-size: 13px; color: #64748b;">${s.grade || '1 класс'}</span>
        </a>
      `
      )
      .join('');
  } catch (err) {
    console.error('Ошибка:', err);
  }
})();