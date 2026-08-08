document.addEventListener('DOMContentLoaded', () => {
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const authForm = document.getElementById('auth-form');
  const submitBtn = document.getElementById('submit-btn');
  const errorMessage = document.getElementById('error-message');

  let mode = 'login';

  if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => {
      mode = 'login';
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      if (submitBtn) submitBtn.textContent = 'Войти';
      showError('');
    });

    registerTab.addEventListener('click', () => {
      mode = 'register';
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      if (submitBtn) submitBtn.textContent = 'Зарегистрироваться';
      showError('');
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showError('');

      const username = document.getElementById('username')?.value.trim();
      const password = document.getElementById('password')?.value.trim();

      if (!username || !password) {
        showError('Заполните все поля');
        return;
      }

      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Произошла ошибка');

        if (data.success) {
          window.location.href = '/index.html';
        }
      } catch (err) {
        showError(err.message);
      }
    });
  }

  function showError(msg) {
    if (errorMessage) {
      errorMessage.textContent = msg;
      errorMessage.style.display = msg ? 'block' : 'none';
    }
  }
});