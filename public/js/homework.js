// Если страница восстановлена из кэша браузера (кнопка "назад") — уходим в меню.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.replace('/index.html');
});

(async function () {
  const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
  const meData = await meRes.json();
  if (!meData.user) {
    window.location.replace('/login.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');

  if (!lessonId) {
    window.location.replace('/index.html');
    return;
  }

  const exitBtn = document.getElementById('exitBtn');
  if (exitBtn) {
    exitBtn.href = `/lesson.html?id=${lessonId}`;
  }

  let tasks = [];
  let savedAnswers = {}; // questionId -> { status, selected_options }
  let currentTaskIndex = 0;

  try {
    const res = await fetch(`/api/homework/${lessonId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Ошибка загрузки');

    const data = await res.json();
    tasks = data.tasks || [];

    (data.savedAnswers || []).forEach((a) => {
      savedAnswers[a.question_id] = a;
    });

    if (tasks.length === 0) {
      document.getElementById('questionContent').innerHTML = '<p class="subtitle">В этом уроке пока нет домашних заданий.</p>';
      return;
    }

    renderSidebar();
    renderQuestion(0);
  } catch (err) {
    document.getElementById('questionContent').innerHTML = '<p class="msg error">Ошибка загрузки заданий.</p>';
  }

  function renderSidebar() {
    const navEl = document.getElementById('questionsNav');
    if (!navEl) return;

    navEl.innerHTML = tasks
      .map((task, idx) => {
        const saved = savedAnswers[task.id];
        let statusClass = '';
        let badge = `${idx + 1}`;

        if (saved) {
          if (saved.status === 'correct') {
            statusClass = 'status-correct';
            badge += ' ✓';
          } else if (saved.status === 'partial') {
            statusClass = 'status-partial';
            badge += ' ~';
          } else if (saved.status === 'incorrect') {
            statusClass = 'status-incorrect';
            badge += ' ✗';
          }
        }

        const activeClass = idx === currentTaskIndex ? 'active' : '';

        return `
        <button class="nav-q-btn ${statusClass} ${activeClass}" data-idx="${idx}">
          Вопрос ${badge}
        </button>
      `;
      })
      .join('');

    navEl.querySelectorAll('.nav-q-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        currentTaskIndex = idx;
        renderSidebar();
        renderQuestion(idx);
      });
    });

    if (tasks.every((t) => savedAnswers[t.id])) {
      renderSummaryBanner();
    }
  }

  function renderSummaryBanner() {
    let container = document.getElementById('summaryBanner');
    if (!container) {
      container = document.createElement('div');
      container.id = 'summaryBanner';
      container.className = 'task-card';
      document.getElementById('questionsNav').insertAdjacentElement('afterend', container);
    }
    const counts = { correct: 0, partial: 0, incorrect: 0 };
    tasks.forEach((t) => counts[savedAnswers[t.id].status]++);
    container.innerHTML = `
      <p style="font-weight:700;margin-bottom:8px;">Задание завершено 🎉</p>
      <p>✅ Верно: ${counts.correct} &nbsp; ⚠️ Частично: ${counts.partial} &nbsp; ❌ Неверно: ${counts.incorrect}</p>
    `;
  }

  function renderQuestion(idx) {
    const task = tasks[idx];
    if (!task) return;

    const saved = savedAnswers[task.id];
    const isLocked = !!saved;
    const container = document.getElementById('questionContent');
    if (!container) return;

    let bodyHTML;
    if (task.type === 'text') {
      const savedValue = saved && Array.isArray(saved.selected_options) ? saved.selected_options[0] : '';
      bodyHTML = `
        <input type="text" id="textAnswerInput" class="text-answer-input"
          value="${savedValue ? String(savedValue).replace(/"/g, '&quot;') : ''}"
          ${isLocked ? 'disabled' : ''} placeholder="Впиши ответ...">
      `;
    } else {
      const isSingle = task.type !== 'multiple';
      const inputType = isSingle ? 'radio' : 'checkbox';
      bodyHTML = `<div class="options-list">${task.options
        .map((opt) => {
          const isChecked = saved && Array.isArray(saved.selected_options) && saved.selected_options.includes(opt.id);
          const disabledAttr = isLocked ? 'disabled' : '';
          let extraClass = '';
          if (isLocked) {
            const correctIds = Array.isArray(task.correctAnswer) ? task.correctAnswer : [task.correctAnswer];
            if (correctIds.includes(opt.id)) extraClass = ' correct-answer';
            else if (isChecked) extraClass = ' wrong-answer';
          }
          return `
          <label class="option-label ${isLocked ? 'disabled' : ''}${extraClass}">
            <input type="${inputType}" name="q_opt" value="${opt.id}" ${isChecked ? 'checked' : ''} ${disabledAttr}>
            <span>${opt.text}</span>
          </label>
        `;
        })
        .join('')}</div>`;
    }

    let statusBanner = '';
    if (saved) {
      if (saved.status === 'correct') {
        statusBanner = '<div class="status-badge-box correct">✅ Ответ принят: ВЕРНО</div>';
      } else if (saved.status === 'partial') {
        statusBanner = '<div class="status-badge-box partial">⚠️ Ответ принят: ЧАСТИЧНО ВЕРНО</div>';
      } else {
        statusBanner = '<div class="status-badge-box incorrect">❌ Ответ принят: НЕВЕРНО</div>';
      }
    }

    const typeHint = task.type === 'multiple' ? ' (можно выбрать несколько)' : '';

    container.innerHTML = `
      <div class="task-header-row">
        <h2>Вопрос №${idx + 1}${typeHint}</h2>
        ${statusBanner}
      </div>
      <p class="task-question">${task.question}</p>
      ${task.image ? `<img src="${task.image}" class="task-image" alt="Задание">` : ''}

      ${bodyHTML}

      <div class="task-footer">
        ${!isLocked ? `<button id="submitAnswerBtn" class="btn-check">Проверить</button>` : `<p class="locked-msg">🔒 Ответ зафиксирован (изменение невозможно)</p>`}
      </div>
    `;

    if (!isLocked) {
      const submitBtn = document.getElementById('submitAnswerBtn');
      if (submitBtn) submitBtn.addEventListener('click', () => submitAnswer(task));
    }
  }

  async function submitAnswer(task) {
    let selected;

    if (task.type === 'text') {
      const value = document.getElementById('textAnswerInput').value.trim();
      if (!value) {
        alert('Впиши ответ!');
        return;
      }
      selected = [value];
    } else {
      selected = Array.from(document.querySelectorAll('input[name="q_opt"]:checked')).map((i) => i.value);
      if (selected.length === 0) {
        alert('Выберите хотя бы один вариант ответа!');
        return;
      }
    }

    const status = computeStatus(task, selected);

    savedAnswers[task.id] = { question_id: task.id, status, selected_options: selected };

    try {
      const res = await fetch(`/api/homework/${lessonId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: task.id, status, selectedOptions: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Не удалось сохранить ответ:', body.error);
      }
    } catch (err) {
      console.error('Ошибка при сохранении ответа:', err);
    }

    renderSidebar();
    renderQuestion(currentTaskIndex);
  }

  function computeStatus(task, selected) {
    if (task.type === 'text') {
      const accepted = Array.isArray(task.correctAnswer) ? task.correctAnswer : [task.correctAnswer];
      const given = String(selected[0] || '').trim().toLowerCase();
      const isCorrect = accepted.some((a) => String(a).trim().toLowerCase() === given);
      return isCorrect ? 'correct' : 'incorrect';
    }

    if (task.type === 'multiple') {
      const correct = Array.isArray(task.correctAnswer) ? task.correctAnswer : [task.correctAnswer];
      const selSet = new Set(selected);
      const corSet = new Set(correct);
      const exact = selSet.size === corSet.size && [...selSet].every((v) => corSet.has(v));
      if (exact) return 'correct';
      const overlap = [...selSet].some((v) => corSet.has(v));
      return overlap ? 'partial' : 'incorrect';
    }

    // "normal" — один правильный вариант
    return selected.length === 1 && selected[0] === task.correctAnswer ? 'correct' : 'incorrect';
  }
})();
