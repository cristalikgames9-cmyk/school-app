(async function () {
  // 1. Проверка авторизации (перенаправление без зацикливания истории)
  const user = await window.API.getMe();
  if (!user) {
    window.location.replace('/login.html');
    return;
  }

  // 2. Получение ID урока из URL
  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('id');

  if (!lessonId) {
    window.location.replace('/');
    return;
  }

  // --- Отрисовка адаптивного плеере видеоурока ---
  function getLessonVideoHtml(videoUrl) {
    if (!videoUrl || videoUrl === 'null' || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      return '';
    }
    return `
      <div class="video-wrapper" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 16px; margin-bottom: 24px; background: #000; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <iframe 
          src="${videoUrl.trim()}" 
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>
    `;
  }

  // --- Отрисовка картинок к заданиям (полностью убирает контейнер, если image null) ---
  function getTaskImageHtml(image) {
    if (!image || image === 'null' || typeof image !== 'string' || image.trim() === '') {
      return '';
    }
    return `
      <div class="task-image-container" style="margin: 12px 0; text-align: center;">
        <img 
          src="${image.trim()}" 
          alt="Иллюстрация к заданию" 
          style="max-width: 100%; max-height: 320px; border-radius: 12px; border: 1px solid #e2e8f0; object-fit: contain;"
        >
      </div>
    `;
  }

  // --- Генерация HTML разметки под каждый тип задачи ---
  function renderTaskHtml(task, index) {
    const imageHtml = getTaskImageHtml(task.image);

    // 1. Тип: normal (Один вариант ответа)
    if (task.type === 'normal') {
      return `
        <div class="task-card" data-task-id="${task.id}" data-type="normal" style="background:#fff; padding:20px; border-radius:12px; margin-bottom:16px; border:1px solid #e2e8f0;">
          <p class="task-title" style="font-weight:700; margin-bottom:8px;"><b>№${index + 1}.</b> ${task.question}</p>
          ${imageHtml}
          <div class="options-list">
            ${task.options.map(opt => `
              <label style="display:block; margin: 8px 0; cursor:pointer;">
                <input type="radio" name="task_${task.id}" value="${opt.id}">
                <b>${opt.id}.</b> ${opt.text}
              </label>
            `).join('')}
          </div>
        </div>`;
    }

    // 2. Тип: multiple (Множественный выбор)
    if (task.type === 'multiple') {
      return `
        <div class="task-card" data-task-id="${task.id}" data-type="multiple" style="background:#fff; padding:20px; border-radius:12px; margin-bottom:16px; border:1px solid #e2e8f0;">
          <p class="task-title" style="font-weight:700; margin-bottom:8px;"><b>№${index + 1}.</b> ${task.question} <span style="font-weight:normal; font-size:13px; color:#64748b;">(выберите несколько вариантов)</span></p>
          ${imageHtml}
          <div class="options-list">
            ${task.options.map(opt => `
              <label style="display:block; margin: 8px 0; cursor:pointer;">
                <input type="checkbox" name="task_${task.id}" value="${opt.id}">
                <b>${opt.id}.</b> ${opt.text}
              </label>
            `).join('')}
          </div>
        </div>`;
    }

    // 3. Тип: text (Текстовый ввод с защитой от регистра)
    if (task.type === 'text') {
      return `
        <div class="task-card" data-task-id="${task.id}" data-type="text" style="background:#fff; padding:20px; border-radius:12px; margin-bottom:16px; border:1px solid #e2e8f0;">
          <p class="task-title" style="font-weight:700; margin-bottom:8px;"><b>№${index + 1}.</b> ${task.question}</p>
          ${imageHtml}
          <input type="text" id="input_${task.id}" class="form-input" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid #cbd5e1; box-sizing:border-box;" placeholder="Введите ответ">
        </div>`;
    }

    // 4. Тип: block (Соотнесение Drag & Drop)
    if (task.type === 'block') {
      return `
        <div class="task-card" data-task-id="${task.id}" data-type="block" style="background:#fff; padding:20px; border-radius:12px; margin-bottom:16px; border:1px solid #e2e8f0;">
          <p class="task-title" style="font-weight:700; margin-bottom:8px;"><b>№${index + 1}.</b> ${task.question}</p>
          ${imageHtml}
          <div class="block-targets" style="margin-bottom: 12px;">
            ${task.items.map(item => `
              <div class="block-target-row" style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                <span style="font-weight:600;">${item.label} = </span>
                <div class="drop-zone" data-item-id="${item.id}" style="min-width:80px; min-height:40px; border:2px dashed #cbd5e1; border-radius:8px; display:flex; align-items:center; justify-content:center; background:#f8fafc;"></div>
              </div>
            `).join('')}
          </div>
          <div class="blocks-pool" style="display:flex; gap:8px; flex-wrap:wrap; padding:12px; background:#f1f5f9; border-radius:12px;">
            ${task.blocks.map((val, bIdx) => `
              <div class="drag-block" draggable="true" data-value="${val}" id="block_${task.id}_${bIdx}" style="padding:8px 16px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; cursor:grab; user-select:none;">${val}</div>
            `).join('')}
          </div>
        </div>`;
    }

    return '';
  }

  // --- Инициализация Drag & Drop для задач типа "block" ---
  function initDragAndDrop() {
    document.querySelectorAll('.drag-block').forEach(block => {
      block.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', block.dataset.value);
        e.dataTransfer.setData('element-id', block.id);
      });
    });

    document.querySelectorAll('.drop-zone, .blocks-pool').forEach(zone => {
      zone.addEventListener('dragover', e => e.preventDefault());
      zone.addEventListener('drop', e => {
        e.preventDefault();
        const elementId = e.dataTransfer.getData('element-id');
        const blockEl = document.getElementById(elementId);

        if (blockEl) {
          if (zone.classList.contains('drop-zone') && zone.children.length > 0) {
            const parentTask = zone.closest('.task-card');
            const pool = parentTask.querySelector('.blocks-pool');
            pool.appendChild(zone.firstElementChild);
          }
          zone.appendChild(blockEl);
        }
      });
    });
  }

  // --- Сбор ответов пользователя ---
  function collectUserAnswers() {
    const answers = {};

    document.querySelectorAll('.task-card').forEach(card => {
      const taskId = card.dataset.taskId;
      const type = card.dataset.type;

      if (type === 'normal') {
        const selected = card.querySelector(`input[name="task_${taskId}"]:checked`);
        answers[taskId] = selected ? selected.value : null;
      } 
      else if (type === 'multiple') {
        const selected = Array.from(card.querySelectorAll(`input[name="task_${taskId}"]:checked`)).map(cb => cb.value);
        answers[taskId] = selected;
      } 
      else if (type === 'text') {
        const val = card.querySelector(`#input_${taskId}`)?.value || '';
        answers[taskId] = val.trim();
      } 
      else if (type === 'block') {
        const blockAnswers = {};
        card.querySelectorAll('.drop-zone').forEach(zone => {
          const itemId = zone.dataset.itemId;
          const block = zone.querySelector('.drag-block');
          blockAnswers[itemId] = block ? block.dataset.value : null;
        });
        answers[taskId] = blockAnswers;
      }
    });

    return answers;
  }

  // --- Загрузка и отображение данных урока ---
  try {
    const res = await window.API.request(`/api/lessons/${lessonId}`);
    if (!res || !res.ok) throw new Error('Не удалось загрузить урок');

    const lesson = await res.json();

    document.title = `${lesson.title} — Damir Online School`;

    const titleEl = document.getElementById('lessonTitle');
    if (titleEl) titleEl.textContent = lesson.title;

    const contentEl = document.getElementById('lessonContent');
    if (contentEl && lesson.content) contentEl.textContent = lesson.content;

    // Вставка видео
    const videoContainer = document.getElementById('lessonVideoContainer');
    if (videoContainer) {
      videoContainer.innerHTML = getLessonVideoHtml(lesson.videoUrl);
    }

    // Вставка заданий
    const tasksContainer = document.getElementById('tasksContainer');
    if (tasksContainer && lesson.tasks) {
      tasksContainer.innerHTML = lesson.tasks.map((task, idx) => renderTaskHtml(task, idx)).join('');
      initDragAndDrop();
    }

    // Отправка домашних заданий
    const submitBtn = document.getElementById('submitHomeworkBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const answers = collectUserAnswers();

        try {
          const sendRes = await window.API.request('/api/homework/submit', {
            method: 'POST',
            body: JSON.stringify({
              lessonId: lesson.id,
              answers: answers
            })
          });

          if (sendRes && sendRes.ok) {
            const result = await sendRes.json();
            const resultEl = document.getElementById('resultMsg');
            if (resultEl) {
              resultEl.style.display = 'block';
              resultEl.style.padding = '12px 16px';
              resultEl.style.borderRadius = '8px';
              resultEl.style.marginTop = '16px';
              resultEl.style.fontWeight = '600';

              if (result.success) {
                resultEl.style.background = '#dcfce7';
                resultEl.style.color = '#15803d';
                resultEl.innerHTML = '🎉 Отлично! Все задания выполнены верно!';
              } else {
                resultEl.style.background = '#fee2e2';
                resultEl.style.color = '#b91c1c';
                resultEl.innerHTML = `⚠️ Не все ответы верны (Правильно: ${result.score}/${result.total}). Попробуйте ещё раз!`;
              }
            }
          }
        } catch (err) {
          alert('Ошибка отправки домашних заданий');
        }
      });
    }

  } catch (err) {
    console.error('Ошибка загрузки урока:', err);
  }
})();