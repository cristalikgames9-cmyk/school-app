(async function () {
  getStudentId();
  const chip = document.getElementById('studentChip');
  const name = getStudentName();
  chip.textContent = name ? `👋 ${name}` : '👋 Гость';

  const grid = document.getElementById('subjectsGrid');
  try {
    const subjects = await api('/subjects');
    grid.innerHTML = subjects
      .map(
        (s) => `
      <a class="cover-card" style="--accent:${s.color}" href="/subject.html?id=${s.id}">
        <div class="sticker">${s.icon}</div>
        <span class="tag">1 класс</span>
        <h3>${s.title}</h3>
      </a>`
      )
      .join('');
  } catch (e) {
    grid.innerHTML = '<div class="empty-state">Не получилось загрузить предметы 😕</div>';
  }
})();
