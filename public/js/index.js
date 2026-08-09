document.addEventListener('DOMContentLoaded', async () => {
  const subjectsList = document.getElementById('subjectsList');
  const userNameEl = document.getElementById('userName');
  const welcomeText = document.getElementById('welcomeText');
  const progressBox = document.getElementById('progressBox');
  const progressText = document.getElementById('progressText');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginBtn = document.getElementById('loginBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { 
        method: 'POST', 
        cache: 'no-store', 
        credentials: 'include' 
      }).catch(() => {});
      window.location.href = '/index.html';
    });
  }

  try {
    const authRes = await fetch('/api/auth/me', { 
      cache: 'no-store', 
      credentials: 'include' 
    });
    const authData = await authRes.json();

    if (authData.user) {
      if (userNameEl) userNameEl.textContent = `👋 ${authData.user.username}`;
      if (welcomeText) welcomeText.textContent = `Привет, ${authData.user.username}!`;
      if (logoutBtn) logoutBtn.style.display = '';
      if (loginBtn) loginBtn.style.display = 'none';

      if (progressBox && progressText && authData.totalLessons > 0) {
        const pct = Math.round((authData.completedLessons / authData.totalLessons) * 100);
        progressText.textContent = `${authData.completedLessons} из ${authData.totalLessons} уроков пройдено (${pct}%)`;
        progressBox.style.display = 'block';
      }
    } else {
      if (userNameEl) userNameEl.textContent = '👋 Гость';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (loginBtn) loginBtn.style.display = '';
      if (progressBox) progressBox.style.display = 'none';
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }

  // Загрузка предметов
  try {
    const res = await fetch('/api/subjects', { 
      cache: 'no-store', 
      credentials: 'include' 
    });
    const subjects = await res.json();
    if (subjectsList) {
      subjectsList.innerHTML = subjects.map(s => `
        <a href="/subject.html?id=${s.id}" class="subject-card">
          <h3>${s.title}</h3>
          <p>${s.description || ''}</p>
        </a>
      `).join('');
    }
  } catch (err) {
    if (subjectsList) subjectsList.innerHTML = '<p>Не удалось загрузить предметы.</p>';
  }
});