(async function () {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');

  if (!lessonId) {
    window.location.href = '/';
    return;
  }

  const hwBtn = document.getElementById('hwBtn');
  if (hwBtn) hwBtn.href = `/homework.html?id=${lessonId}`;

  try {
    const res = await fetch(`/api/lessons/${lessonId}`);
    if (!res.ok) throw new Error('Урок не найден');
    const lesson = await res.json();

    document.title = `${lesson.title} — Школа №1`;
    document.getElementById('lessonTitle').textContent = lesson.title;
    document.getElementById('lessonDescription').textContent = lesson.description || '';

    // Привязываем ссылку «Назад» к конкретному предмету
    const backLink = document.getElementById('backToSubjectLink');
    if (backLink) {
      if (lesson.subjectId) {
        backLink.href = `/subject.html?id=${lesson.subjectId}`;
      } else {
        backLink.href = '/';
      }
    }

    if (lesson.video) {
      document.getElementById('videoBox').style.display = 'block';
      document.getElementById('lessonVideo').src = lesson.video;
    } else {
      document.getElementById('videoBox').style.display = 'none';
    }

    // Загружаем статистику ДЗ
    const hwRes = await fetch(`/api/homework/${lessonId}`);
    if (hwRes.ok) {
      const hwData = await hwRes.json();
      const saved = hwData.savedAnswers || [];
      const total = hwData.tasks ? hwData.tasks.length : 0;

      if (saved.length > 0) {
        const correct = saved.filter(a => a.status === 'correct').length;
        const partial = saved.filter(a => a.status === 'partial').length;
        const incorrect = saved.filter(a => a.status === 'incorrect').length;

        document.getElementById('hwStatsText').innerHTML = 
          `Выполнено: <b>${saved.length}/${total}</b> | ✅ Верно: <b>${correct}</b> | ⚠️ Частично: <b>${partial}</b> | ❌ Неверно: <b>${incorrect}</b>`;
      }
    }
  } catch (err) {
    document.getElementById('lessonTitle').textContent = 'Ошибка загрузки урока';
  }
})();