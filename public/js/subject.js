(async function () {
  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('id');

  if (!subjectId) {
    window.location.href = '/';
    return;
  }

  try {
    const res = await fetch(`/api/subjects/${subjectId}`);
    if (!res.ok) throw new Error('Предмет не найден');
    const data = await res.json();

    document.title = `${data.subject.title} — Школа №1`;
    document.getElementById('subjectTitle').textContent = data.subject.title;

    const listEl = document.getElementById('lessonsList');
    if (!data.lessons || data.lessons.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Уроки пока не добавлены 📝</p>';
      return;
    }

    listEl.innerHTML = data.lessons
      .map((l, index) => `
        <a href="/lesson.html?id=${l.id}" class="lesson-card">
          <div class="lesson-num">Урок ${index + 1}</div>
          <h3 class="lesson-title">${l.title}</h3>
        </a>
      `)
      .join('');
  } catch (err) {
    document.getElementById('subjectTitle').textContent = 'Ошибка загрузки предмета';
  }
})();