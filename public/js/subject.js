(async function () {
  const user = await API.getMe();
  if (!user) {
    // replace не сохраняет промежуточную страницу в истории
    window.location.replace('/login.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('id');

  if (!subjectId) {
    window.location.replace('/');
    return;
  }

  try {
    const res = await fetch(`/api/subjects/${subjectId}`);
    if (!res.ok) throw new Error('Предмет не найден');
    const data = await res.json();

    document.title = `${data.subject.title} — Damir Online School`;
    document.getElementById('subjectTitle').textContent = data.subject.title;

    const listEl = document.getElementById('lessonsList');
    if (!data.lessons || data.lessons.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Уроки пока не добавлены 📝</p>';
      return;
    }

    listEl.innerHTML = data.lessons
      .map((l, index) => `
        <a href="/lesson.html?id=${l.id}" class="lesson-card ${l.isCompleted ? 'completed' : ''}">
          <div class="lesson-num">Урок ${index + 1}</div>
          <h3 class="lesson-title" style="flex: 1;">${l.title}</h3>
          ${l.isCompleted ? '<span class="check-badge" title="Урок пройден">✅</span>' : ''}
        </a>
      `)
      .join('');
  } catch (err) {
    document.getElementById('subjectTitle').textContent = 'Ошибка загрузки предмета';
  }
})();