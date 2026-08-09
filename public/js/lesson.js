// Если страница восстановлена из кэша браузера (кнопка "назад") — уходим в меню.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.replace('/index.html');
});

document.addEventListener('DOMContentLoaded', async () => {
  // Без аккаунта прогресс не сохранится — отправляем на вход
  const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
  const meData = await meRes.json();
  if (!meData.user) {
    window.location.replace('/login.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');
  const titleEl = document.getElementById('lessonTitle');
  const descEl = document.getElementById('lessonDescription');
  const videoBox = document.getElementById('videoBox');
  const videoFrame = document.getElementById('lessonVideo');
  const hwBtn = document.getElementById('hwBtn');
  const backLink = document.getElementById('backToSubjectLink');

  if (!lessonId) {
    if (titleEl) titleEl.textContent = 'Урок не найден';
    return;
  }

  try {
    const res = await fetch(`/api/lessons/${lessonId}`, { cache: 'no-store' });
    const lesson = await res.json();
    if (!res.ok) throw new Error(lesson.error || 'Ошибка загрузки урока');

    if (titleEl) titleEl.textContent = lesson.title;
    if (descEl) descEl.textContent = lesson.content || lesson.theory || '';

    if (videoFrame && videoBox && lesson.videoUrl) {
      videoFrame.src = lesson.videoUrl;
      videoBox.style.display = 'block';
    }

    if (hwBtn) hwBtn.href = `/homework.html?id=${lesson.id}`;
    if (backLink && lesson.subjectId) backLink.href = `/subject.html?id=${lesson.subjectId}`;
  } catch (err) {
    if (titleEl) titleEl.textContent = 'Ошибка загрузки урока';
    if (descEl) descEl.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
});
