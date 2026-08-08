document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('id');

  const titleEl = document.getElementById('subject-title') || document.querySelector('h1');
  const lessonsContainer = document.getElementById('lessons-list') || document.querySelector('.lessons-container');

  if (!subjectId) {
    if (titleEl) titleEl.textContent = 'Ошибка загрузки предмета';
    return;
  }

  try {
    const data = await API.get(`/api/subjects/${subjectId}`);
    
    if (titleEl) titleEl.textContent = data.subject.title || data.subject.name;

    if (lessonsContainer) {
      if (!data.lessons || data.lessons.length === 0) {
        lessonsContainer.innerHTML = '<p>В этом предмете пока нет уроков.</p>';
        return;
      }

      lessonsContainer.innerHTML = data.lessons.map(l => `
        <div class="lesson-card">
          <h4>${l.title}</h4>
          <a href="/lesson.html?id=${l.id}" class="btn">Перейти к уроку</a>
        </div>
      `).join('');
    }
  } catch (err) {
    if (titleEl) titleEl.textContent = 'Ошибка загрузки предмета';
    if (lessonsContainer) lessonsContainer.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
});