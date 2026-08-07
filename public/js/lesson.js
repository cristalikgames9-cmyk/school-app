(async function () {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');

  if (!lessonId) {
    window.location.href = '/';
    return;
  }

  try {
    const res = await fetch(`/api/lessons/${lessonId}`);
    if (!res.ok) throw new Error('Урок не найден');
    const lesson = await res.json();

    document.title = `${lesson.title} — Школа №1`;
    document.getElementById('lessonTitle').textContent = lesson.title;
    document.getElementById('lessonDescription').textContent = lesson.description;

    if (lesson.video) {
      document.getElementById('lessonVideo').src = lesson.video;
      document.getElementById('videoBox').style.display = 'block';
    }

    renderTasks(lesson.tasks);
  } catch (err) {
    document.getElementById('lessonTitle').textContent = 'Урок не найден';
  }
})();

function renderTasks(tasks) {
  const container = document.getElementById('tasksSection');
  if (!tasks || tasks.length === 0) return;

  let html = '<h2 class="tasks-header">Домашнее задание</h2>';

  tasks.forEach((t, i) => {
    const isMultiple = t.answer.length > 1;
    const inputType = isMultiple ? 'checkbox' : 'radio';

    html += `
      <div class="task-card" id="task-${i}">
        <p class="task-question"><strong>№${i + 1}. ${t.question}</strong></p>
        ${t.image ? `<img src="${t.image}" class="task-image" alt="Иллюстрация">` : ''}
        <div class="options-list">
          ${t.options.map(opt => `
            <label class="option-label">
              <input type="${inputType}" name="q${i}" value="${opt}">
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
        <button class="btn-check" onclick="checkTask(${i}, ${JSON.stringify(t.answer).replace(/"/g, '&quot;')})">Проверить</button>
        <div id="result-${i}" class="status-msg"></div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function checkTask(index, correctAnswers) {
  const selected = Array.from(document.querySelectorAll(`input[name="q${index}"]:checked`)).map(el => el.value);
  const resultDiv = document.getElementById(`result-${index}`);

  if (selected.length === 0) {
    resultDiv.innerHTML = '<span class="msg warning">Выберите хотя бы один вариант!</span>';
    return;
  }

  const isExact = selected.length === correctAnswers.length && selected.every(val => correctAnswers.includes(val));
  const isPartial = !isExact && selected.some(val => correctAnswers.includes(val));

  if (isExact) {
    resultDiv.innerHTML = '<span class="msg success">Правильно! 🎉</span>';
  } else if (isPartial) {
    resultDiv.innerHTML = '<span class="msg warning">Частично правильно ⚠️</span>';
  } else {
    resultDiv.innerHTML = '<span class="msg error">Неправильно ❌</span>';
  }
}