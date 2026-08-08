document.addEventListener('DOMContentLoaded', async () => {
  // Без аккаунта прогресс не сохранится — отправляем на вход
  const meRes = await fetch('/api/auth/me');
  const meData = await meRes.json();
  if (!meData.user) {
    window.location.href = '/login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('id');
  
  // Строго ID из subject.html
  const titleEl = document.getElementById('subjectTitle');
  const lessonsList = document.getElementById('lessonsList');

  if (!subjectId) {
    if (titleEl) titleEl.textContent = 'Ошибка: Предмет не выбран';
    return;
  }

  try {
    const res = await fetch(`/api/subjects/${subjectId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');

    if (titleEl) titleEl.textContent = data.subject.title || data.subject.name;

    if (lessonsList) {
      if (!data.lessons || data.lessons.length === 0) {
        lessonsList.innerHTML = '<p>В этом предмете пока нет уроков.</p>';
      } else {
        // Рендерим уроки с сохранением твоих классов
        const completedIds = meData.completedLessonIds || [];
        lessonsList.innerHTML = data.lessons.map(l => {
          const isDone = completedIds.includes(l.id);
          return `
          <div class="lesson-card ${isDone ? 'completed' : ''}">
            <h4>${l.title || 'Урок'} ${isDone ? '<span class="check-badge">✅</span>' : ''}</h4>
            <a href="/lesson.html?id=${l.id}" class="btn-primary">Перейти к уроку</a>
          </div>
        `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Ошибка:', err);
    if (titleEl) titleEl.textContent = 'Ошибка загрузки предмета';
    if (lessonsList) lessonsList.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
});