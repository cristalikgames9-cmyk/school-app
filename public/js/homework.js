(async function () {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');

  if (!lessonId) {
    window.location.href = '/';
    return;
  }

  // Явная ссылка "Назад к уроку" вместо history.back()
  const exitBtn = document.getElementById('exitBtn');
  if (exitBtn) {
    exitBtn.href = `/lesson.html?id=${lessonId}`;
  }

  let tasks = [];
  let savedAnswers = {};
  let currentTaskIndex = 0;

  try {
    const res = await fetch(`/api/homework/${lessonId}`);
    if (!res.ok) throw new Error('Ошибка загрузки');
    
    const data = await res.json();
    tasks = data.tasks || [];
    
    // Преобразуем массив сохраненных ответов в объект по question_id
    (data.savedAnswers || []).forEach(a => {
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

  // Отрисовка бокового меню с кнопками вопросов
  function renderSidebar() {
    const navEl = document.getElementById('questionsNav');
    if (!navEl) return;

    navEl.innerHTML = tasks.map((task, idx) => {
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
    }).join('');

    navEl.querySelectorAll('.nav-q-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        currentTaskIndex = idx;
        renderSidebar();
        renderQuestion(idx);
      });
    });
  }

  // Отрисовка конкретного вопроса
  function renderQuestion(idx) {
    const task = tasks[idx];
    if (!task) return;

    const saved = savedAnswers[task.id];
    const isLocked = !!saved; // Ответ уже зафиксирован — блокируем изменение

    const container = document.getElementById('questionContent');
    if (!container) return;

    const optionsHTML = task.options.map((opt) => {
      const isChecked = saved && saved.selected_options && saved.selected_options.includes(opt);
      const disabledAttr = isLocked ? 'disabled' : '';

      return `
        <label class="option-label ${isLocked ? 'disabled' : ''}">
          <input type="checkbox" name="q_opt" value="${opt}" ${isChecked ? 'checked' : ''} ${disabledAttr}>
          <span>${opt}</span>
        </label>
      `;
    }).join('');

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

    container.innerHTML = `
      <div class="task-header-row">
        <h2>Вопрос №${idx + 1}</h2>
        ${statusBanner}
      </div>
      <p class="task-question">${task.question}</p>
      ${task.image ? `<img src="${task.image}" class="task-image" alt="Задание">` : ''}

      <div class="options-list">${optionsHTML}</div>

      <div class="task-footer">
        ${!isLocked ? `<button id="submitAnswerBtn" class="btn-primary">Ответить</button>` : `<p class="locked-msg">🔒 Ответ зафиксирован (изменение невозможно)</p>`}
      </div>
    `;

    if (!isLocked) {
      const submitBtn = document.getElementById('submitAnswerBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => submitAnswer(task));
      }
    }
  }

  // Проверка и отправка ответа
  async function submitAnswer(task) {
    const selected = Array.from(document.querySelectorAll('input[name="q_opt"]:checked')).map(i => i.value);

    if (selected.length === 0) {
      alert('Выберите хотя бы один вариант ответа!');
      return;
    }

    const correctAnswers = Array.isArray(task.answer) ? task.answer : [task.answer];
    
    // Подсчет результатов
    let correctCount = selected.filter(val => correctAnswers.includes(val)).length;
    let wrongCount = selected.filter(val => !correctAnswers.includes(val)).length;

    let status = 'incorrect';
    if (correctCount === correctAnswers.length && wrongCount === 0) {
      status = 'correct';
    } else if (correctCount > 0 && wrongCount === 0) {
      status = 'partial';
    }

    // Сохранение в локальном состоянии
    savedAnswers[task.id] = {
      question_id: task.id,
      status: status,
      selected_options: selected
    };

    // Отправка на сервер
    try {
      await fetch(`/api/homework/${lessonId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: task.id,
          status: status,
          selectedOptions: selected
        })
      });
    } catch (err) {
      console.error('Ошибка при сохранении ответа:', err);
    }

    renderSidebar();
    renderQuestion(currentTaskIndex);
  }
})();