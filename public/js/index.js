document.addEventListener('DOMContentLoaded', async () => {
  const subjectsContainer = document.getElementById('subjects-list') || document.querySelector('.subjects-grid');
  if (!subjectsContainer) return;

  try {
    const res = await fetch('/api/subjects');
    const subjects = await res.json();

    if (!subjects || subjects.length === 0) {
      subjectsContainer.innerHTML = '<p>Предметы не найдены.</p>';
      return;
    }

    subjectsContainer.innerHTML = subjects.map(s => `
      <a href="/subject.html?id=${s.id}" class="subject-card">
        <h3>${s.title || s.name}</h3>
        <p>${s.description || ''}</p>
      </a>
    `).join('');
  } catch (err) {
    console.error('Ошибка загрузки:', err);
    subjectsContainer.innerHTML = '<p style="color:red">Не удалось загрузить предметы.</p>';
  }
});