(async function () {
  // Проверяем авторизацию ученика и обновляем плашку в шапке
  await checkAuth();

  const params = new URLSearchParams(location.search);
  const lessonId = params.get('id');
  const titleEl = document.getElementById('lessonTitle');

  if (!lessonId) {
    titleEl.textContent = 'Урок не выбран';
    return;
  }

  try {
    const lesson = await api('/lessons/' + lessonId);

    titleEl.textContent = lesson.title;
    document.getElementById('lessonDesc').textContent = lesson.description;

    // Вставка Kinescope плеера
    document.getElementById('videoWrap').innerHTML = `
      <iframe
        src="https://kinescope.io/embed/${lesson.videoId}"
        title="${lesson.title}"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope"
        allowfullscreen
        frameborder="0"
        loading="lazy">
      </iframe>`;

    document.getElementById('homeworkLink').href = '/homework.html?lesson=' + lesson.id;
    document.getElementById('breadcrumb').innerHTML = `
      <a href="/index.html">← Все предметы</a> · 
      <a href="/subject.html?id=${lesson.subjectId}">К урокам</a>
    `;
  } catch (e) {
    titleEl.textContent = 'Урок не найден';
  }
})();