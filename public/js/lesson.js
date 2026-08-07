(async function () {
  getStudentId();
  document.getElementById('studentChip').textContent = getStudentName()
    ? `👋 ${getStudentName()}`
    : '👋 Гость';

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
    document.getElementById('videoWrap').innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${lesson.videoId}"
        title="${lesson.title}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen>
      </iframe>`;
    document.getElementById('homeworkLink').href = '/homework.html?lesson=' + lesson.id;
    document.getElementById(
      'breadcrumb'
    ).innerHTML = `<a href="/index.html">← Все предметы</a> · <a href="/subject.html?id=${lesson.subjectId}">К урокам</a>`;
  } catch (e) {
    titleEl.textContent = 'Урок не найден';
  }
})();
