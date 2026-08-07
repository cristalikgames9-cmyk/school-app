async function api(path, options = {}) {
  try {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 401 && path !== '/auth/me') {
      showAuthModal();
      throw new Error('Требуется авторизация');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка запроса');
    }
    return res.json();
  } catch (err) {
    console.error('API Error:', path, err);
    throw err;
  }
}

function showAuthModal() {
  if (document.querySelector('.modal-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3 id="modalTitle">Вход в аккаунт</h3>
      <p style="color:#6b6280;font-size:14px;margin-top:4px;" id="modalSub">Введите данные для входа</p>
      <input type="text" id="authUsername" placeholder="Имя (English)" maxlength="20" />
      <input type="password" id="authPassword" placeholder="Пароль (4-12 символов)" maxlength="12" />
      <div id="authError" style="color:var(--reading);font-size:13px;margin-bottom:10px;"></div>
      <button class="btn" id="authSubmit" style="width:100%;justify-content:center;">Войти</button>
      <button class="btn btn-ghost" id="authToggle" style="width:100%;justify-content:center;margin-top:8px;box-shadow:none;">Нет аккаунта? Зарегистрироваться</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  let isRegister = false;
  const usernameInput = backdrop.querySelector('#authUsername');
  const passwordInput = backdrop.querySelector('#authPassword');
  const submitBtn = backdrop.querySelector('#authSubmit');
  const toggleBtn = backdrop.querySelector('#authToggle');
  const errorEl = backdrop.querySelector('#authError');

  toggleBtn.addEventListener('click', () => {
    isRegister = !isRegister;
    document.getElementById('modalTitle').textContent = isRegister ? 'Регистрация' : 'Вход в аккаунт';
    submitBtn.textContent = isRegister ? 'Создать аккаунт' : 'Войти';
    toggleBtn.textContent = isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
    errorEl.textContent = '';
  });

  submitBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    try {
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value.trim(),
        }),
      });
      backdrop.remove();
      location.reload();
    } catch (e) {
      errorEl.textContent = e.message;
    }
  });
}

async function checkAuth() {
  try {
    const data = await api('/auth/me');
    const chip = document.getElementById('studentChip');
    if (chip) chip.textContent = `👋 Привет, ${data.user.username}!`;
    return data;
  } catch (e) {
    const chip = document.getElementById('studentChip');
    if (chip) {
      chip.textContent = '🔑 Войти';
      chip.style.cursor = 'pointer';
      chip.onclick = showAuthModal;
    }
    return null;
  }
}