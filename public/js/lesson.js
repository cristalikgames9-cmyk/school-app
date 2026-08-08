document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');
  const container = document.getElementById('lesson-content');

  if (!lessonId) {
    if (container) container.innerHTML = '<h2>Урок не найден</h2>';
    return;
  }

  try {
    const lesson = await API.get(`/api/lessons/${lessonId}`);
    if (container) {
      container.innerHTML = `
        <h1>${lesson.title}</h1>
        <div class="theory">${lesson.theory || lesson.content || ''}</div>
      `;
    }
  } catch (err) {
    if (container) container.innerHTML = `<h2>Ошибка загрузки урока</h2><p>${err.message}</p>`;
  }
});