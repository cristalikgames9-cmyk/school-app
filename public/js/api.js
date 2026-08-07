// Общие функции: определение "ученика" (без пароля, просто имя) и обёртка над fetch.

function getStudentId() {
  let id = localStorage.getItem('studentId');
  if (!id) {
    id = 'st_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('studentId', id);
  }
  return id;
}

function getStudentName() {
  return localStorage.getItem('studentName') || '';
}

function setStudentName(name) {
  localStorage.setItem('studentName', name);
}

// Показывает модалку "Как тебя зовут?", если имя ещё не задано.
function ensureStudentName(onReady) {
  const name = getStudentName();
  if (name) return onReady(name);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Привет! Как тебя зовут?</h3>
      <p style="color:#6b6280;font-size:14px;margin-top:8px;">Это нужно, чтобы сохранять твои результаты.</p>
      <input type="text" id="nameInput" placeholder="Например, Аня" maxlength="40" />
      <button class="btn" id="nameSubmit" style="width:100%;justify-content:center;">Начать учиться</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  const input = backdrop.querySelector('#nameInput');
  const submit = backdrop.querySelector('#nameSubmit');
  input.focus();

  function submitName() {
    const value = input.value.trim() || 'Ученик';
    setStudentName(value);
    backdrop.remove();
    onReady(value);
  }

  submit.addEventListener('click', submitName);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitName();
  });
}

async function api(path, options) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error('Ошибка запроса: ' + path);
  return res.json();
}
