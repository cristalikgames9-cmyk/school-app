(async function () {
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');

  if (!lessonId) {
    window.location.href = '/';
    return;
  }

  document.getElementById('exitBtn').href = `/lesson.html?id=${lessonId}`;

  let tasks = [];
  let savedAnswers = {};
  let currentTaskIndex = 0;

  try {
    const res = await fetch(`/api/homework/${lessonId}`);
    if (!res.ok) throw new Error('Ошибка загрузки');
    
    const data = await res.json();
    tasks = data.tasks || [];
    
    // Преобразуем массив ответов в объект
    (data.savedAnswers || []).forEach(a => {
      savedAnswers[a.question_id] = a;
    });

    if (tasks.length === 0) {
      document.getElementById('questionContent').innerHTML = '<p>В этом уроке пока нет домашних заданий.</p>';
      return;
    }

    renderSidebar();
    renderQuestion(0);
  } catch (err) {
    document.getElementById('questionContent').innerHTML = '<p class="msg error">Ошибка загрузки заданий.</p>';
  }

  function renderSidebar() {
    const navEl = document.getElementById('questionsNav');
    navEl.innerHTML = tasks.map((task, idx) => {
      const saved = savedAnswers[task.id];
      let statusClass = '';
      let badge = `${idx + 1}`;

      if (saved) {
        if (saved.status === 'correct') { statusClass = 'status-correct'; badge += ' ✓'; }
        else if (saved.status === 'partial') { statusClass = 'status-partial'; badge += ' ~'; }
        else if (saved.status === 'incorrect') { statusClass = 'status-incorrect'; badge += ' ✗'; }
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
        const idx = Number(e.target.dataset.idx);
        currentTaskIndex = idx;
        renderSidebar();
        renderQuestion(idx);
      });
    });
  }

  function renderQuestion(idx) {
    const task = tasks[idx];
    const saved = savedAnswers[task.id];
    const isLocked = !!saved; // Ответ уже дан — заблокировано

    const container = document.getElementById('questionContent');

    const optionsHTML = task.options.map((opt, oIdx) => {
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
      ${task.image ? `<img src="${task.image}" class="task-image">` : ''}

      <div class="options-list">${optionsHTML}</div>

      <div class="task-footer">
        ${!isLocked ? `<button id="submitAnswerBtn" class="btn-primary">Ответить</button>` : `<p class="locked-msg">🔒 Ответ зафиксирован (изменение невозможно)</p>`}
      </div>
    `;

    if (!isLocked) {
      document.getElementById('submitAnswerBtn').addEventListener('click', () => submitAnswer(task));
    }
  }

  async function submitAnswer(task) {
    const selected = Array.from(document.querySelectorAll('input[name="q_opt"]:checked')).map(i => i.value);

    if (selected.length === 0) {
      alert('Выберите хотя бы один вариант ответа!');
      return;
    }

    const correctAnswers = Array.isArray(task.answer) ? task.answer : [task.answer];
    
    // Вычисляем статус
    let correctCount = selected.filter(val => correctAnswers.includes(val)).length;
    let wrongCount = selected.filter(val => !correctAnswers.includes(val)).length;

    let status = 'incorrect';
    if (correctCount === correctAnswers.length && wrongCount === 0) {
      status = 'correct';
    } else if (correctCount > 0 && wrongCount === 0) {
      status = 'partial';
    }

    // Сохраняем локально и отправляем на сервер
    savedAnswers[task.id] = {
      question_id: task.id,
      status: status,
      selected_options: selected
    };

    await fetch(`/api/homework/${lessonId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: task.id,
        status: status,
        selectedOptions: selected
      })
    });

    renderSidebar();
    renderQuestion(currentTaskIndex);
  }
})();