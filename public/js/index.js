document.addEventListener('DOMContentLoaded', async () => {
  const subjectsContainer = document.getElementById('subjects-list') || document.querySelector('.subjects-grid');

  try {
    const subjects = await API.get('/api/subjects');
    if (!subjectsContainer) return;

    if (!subjects || subjects.length === 0) {
      subjectsContainer.innerHTML = '<p>Предметы не найдены</p>';
      return;
    }

    subjectsContainer.innerHTML = subjects.map(s => `
      <a href="/subject.html?id=${s.id}" class="subject-card">
        <h3>${s.title || s.name}</h3>
        <p>${s.description || ''}</p>
      </a>
    `).join('');
  } catch (err) {
    if (subjectsContainer) subjectsContainer.innerHTML = '<p>Не удалось загрузить предметы</p>';
  }
});