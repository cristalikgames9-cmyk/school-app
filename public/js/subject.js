(async function () {
  getStudentId();
  document.getElementById('studentChip').textContent = getStudentName()
    ? `👋 ${getStudentName()}`
    : '👋 Гость';

  const params = new URLSearchParams(location.search);
  const subjectId = params.get('id');
  const grid = document.getElementById('lessonsGrid');
  const titleEl = document.getElementById('subjectTitle');

  if (!subjectId) {
    titleEl.textContent = 'Предмет не выбран';
    return;
  }

  try {
    const { subject, lessons } = await api('/subjects/' + subjectId);
    titleEl.textContent = `${subject.icon} ${subject.title}`;
    document.documentElement.style.setProperty('--current-accent', subject.color);

    if (lessons.length === 0) {
      grid.innerHTML = '<div class="empty-state">Уроки скоро появятся 🙂</div>';
      return;
    }

    grid.innerHTML = lessons
      .map(
        (l, i) => `
      <a class="cover-card" style="--accent:${subject.color}" href="/lesson.html?id=${l.id}">
        <div class="sticker">${i + 1}</div>
        <span class="tag">Урок ${i + 1}</span>
        <h3>${l.title.replace(/^Урок \d+\.\s*/, '')}</h3>
        <p>${l.description}</p>
      </a>`
      )
      .join('');
  } catch (e) {
    titleEl.textContent = 'Предмет не найден';
  }
})();
