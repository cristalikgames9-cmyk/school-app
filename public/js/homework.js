(async function () {
  getStudentId();
  document.getElementById('studentChip').textContent = getStudentName()
    ? `👋 ${getStudentName()}`
    : '👋 Гость';

  const params = new URLSearchParams(location.search);
  const lessonId = params.get('lesson');
  const app = document.getElementById('app');
  const progressTrack = document.getElementById('progressTrack');

  if (!lessonId) {
    app.innerHTML = '<div class="empty-state">Урок не указан</div>';
    return;
  }

  let lesson, tasks;
  try {
    [lesson, tasks] = await Promise.all([
      api('/lessons/' + lessonId),
      api('/homework/' + lessonId),
    ]);
  } catch (e) {
    app.innerHTML = '<div class="empty-state">Не получилось загрузить задание 😕</div>';
    return;
  }

  document.getElementById(
    'breadcrumb'
  ).innerHTML = `<a href="/index.html">← Все предметы</a> · <a href="/subject.html?id=${lesson.subjectId}">К урокам</a> · <a href="/lesson.html?id=${lesson.id}">${lesson.title}</a>`;

  // state: массив ответов по каждой задаче
  const state = tasks.map((t) => ({ selected: [], locked: false, verdict: null }));
  let current = 0;
  let finished = false;

  ensureStudentName(() => renderAll());

  function computeVerdict(task, selected) {
    const correct = task.correct;
    if (task.type === 'single') {
      return selected.length === 1 && correct.includes(selected[0]) ? 'correct' : 'wrong';
    }
    // multiple
    const selSet = new Set(selected);
    const corSet = new Set(correct);
    const exact =
      selSet.size === corSet.size && [...selSet].every((v) => corSet.has(v));
    if (exact) return 'correct';
    const overlap = [...selSet].some((v) => corSet.has(v));
    return overlap ? 'partial' : 'wrong';
  }

  function verdictLabel(v) {
    if (v === 'correct') return '✅ Верно!';
    if (v === 'partial') return '🟡 Частично верно';
    return '❌ Неверно';
  }

  function renderProgress() {
    progressTrack.innerHTML = tasks
      .map((t, i) => {
        const s = state[i];
        let cls = 'progress-dot';
        if (i === current && !finished) cls += ' active';
        if (s.locked) {
          if (s.verdict === 'correct') cls += ' done';
          else if (s.verdict === 'partial') cls += ' partial';
          else cls += ' wrong';
        }
        return `<div class="${cls}" data-index="${i}">${i + 1}</div>`;
      })
      .join('');

    progressTrack.querySelectorAll('.progress-dot').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.index);
        if (state[idx].locked || idx === current) {
          current = idx;
          finished = false;
          renderAll();
        }
      });
    });
  }

  function renderTask() {
    const task = tasks[current];
    const s = state[current];
    const inputType = task.type === 'single' ? 'radio' : 'checkbox';

    const questionImageHtml = task.image
      ? `<img class="question-image" src="${task.image}" alt="" />`
      : '';

    const optionsHtml = task.options
      .map((opt, i) => {
        // Вариант ответа может быть просто строкой "Текст"
        // либо объектом { "text": "Текст", "image": "https://..." }
        const optText = typeof opt === 'string' ? opt : opt.text || '';
        const optImage = typeof opt === 'string' ? null : opt.image;

        const isSelected = s.selected.includes(i);
        let cls = 'option';
        if (optImage) cls += ' option-with-image';
        if (isSelected) cls += ' selected';
        if (s.locked) {
          cls += ' locked';
          if (task.correct.includes(i)) cls += ' correct-answer';
          else if (isSelected) cls += ' wrong-answer';
        }
        const optionImageHtml = optImage
          ? `<img class="option-image" src="${optImage}" alt="" />`
          : '';
        return `
        <label class="${cls}" data-index="${i}">
          <input type="${inputType}" name="opt" ${isSelected ? 'checked' : ''} ${s.locked ? 'disabled' : ''} />
          ${optionImageHtml}
          <span>${optText}</span>
        </label>`;
      })
      .join('');

    const hasOptionImages = task.options.some((o) => typeof o === 'object' && o.image);
    const optionsWrapClass = hasOptionImages ? 'options grid-options' : 'options';

    const verdictHtml = s.locked
      ? `<div class="verdict ${s.verdict}">${verdictLabel(s.verdict)}</div>`
      : '';

    const isLast = current === tasks.length - 1;
    let actionsHtml;
    if (!s.locked) {
      actionsHtml = `<button class="btn" id="checkBtn" disabled>Проверить</button>`;
    } else if (isLast) {
      actionsHtml = `<button class="btn" id="nextBtn">Показать результат →</button>`;
    } else {
      actionsHtml = `<button class="btn" id="nextBtn">Следующая задача →</button>`;
    }

    app.innerHTML = `
      <div class="task-card">
        <span class="tag" style="margin-bottom:10px;display:inline-block;">Задача ${current + 1} из ${tasks.length}${task.type === 'multiple' ? ' · выбери все верные варианты' : ''}</span>
        <div class="task-question">${task.question}</div>
        ${questionImageHtml}
        <div class="${optionsWrapClass}">${optionsHtml}</div>
        ${verdictHtml}
        <div class="task-actions">${actionsHtml}</div>
      </div>
    `;

    if (!s.locked) {
      app.querySelectorAll('.option').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.dataset.index);
          if (task.type === 'single') {
            s.selected = [idx];
          } else {
            const pos = s.selected.indexOf(idx);
            if (pos >= 0) s.selected.splice(pos, 1);
            else s.selected.push(idx);
          }
          renderTask();
        });
      });

      const checkBtn = document.getElementById('checkBtn');
      checkBtn.disabled = s.selected.length === 0;
      checkBtn.addEventListener('click', () => {
        s.locked = true;
        s.verdict = computeVerdict(task, s.selected);
        renderTask();
        renderProgress();
      });
    } else {
      const nextBtn = document.getElementById('nextBtn');
      nextBtn.addEventListener('click', () => {
        if (isLast) {
          finished = true;
          renderAll();
        } else {
          current += 1;
          renderAll();
        }
      });
    }
  }

  function renderSummary() {
    const counts = { correct: 0, partial: 0, wrong: 0 };
    state.forEach((s) => counts[s.verdict]++);
    const total = tasks.length;
    const scoreText = `${counts.correct} / ${total}`;

    app.innerHTML = `
      <div class="summary-card">
        <div class="tag">Задание завершено</div>
        <div class="summary-score">${scoreText}</div>
        <p style="color:#6b6280;">задач решено полностью верно</p>
        <div class="summary-breakdown">
          <div class="summary-pill correct">✅ Верно: ${counts.correct}</div>
          <div class="summary-pill partial">🟡 Частично: ${counts.partial}</div>
          <div class="summary-pill wrong">❌ Неверно: ${counts.wrong}</div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:10px;">
          <button class="btn" id="saveBtn">Сохранить результат</button>
          <a class="btn btn-ghost" href="/subject.html?id=${lesson.subjectId}">К списку уроков</a>
        </div>
        <p id="saveStatus" style="margin-top:14px;color:#6b6280;font-size:14px;"></p>
      </div>
    `;

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const statusEl = document.getElementById('saveStatus');
      statusEl.textContent = 'Сохраняем…';
      try {
        await api('/results', {
          method: 'POST',
          body: JSON.stringify({
            studentId: getStudentId(),
            studentName: getStudentName(),
            lessonId: lesson.id,
            answers: state.map((s, i) => ({
              taskId: tasks[i].id,
              selected: s.selected,
              verdict: s.verdict,
            })),
            score: counts,
          }),
        });
        statusEl.textContent = '✅ Результат сохранён';
      } catch (e) {
        statusEl.textContent = '⚠️ Не получилось сохранить, но результат ты видишь выше';
      }
    });
  }

  function renderAll() {
    renderProgress();
    if (finished) renderSummary();
    else renderTask();
  }
})();
