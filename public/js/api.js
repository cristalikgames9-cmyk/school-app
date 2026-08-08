const API = {
  async request(url, options = {}) {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const config = { ...options, headers: { ...defaultHeaders, ...options.headers } };
    try {
      const response = await fetch(url, config);
      return response;
    } catch (error) {
      console.error(`Ошибка сетевого запроса (${url}):`, error);
      throw error;
    }
  },

  async getMe() {
    try {
      const res = await this.request('/api/auth/me');
      if (res && res.ok) {
        const data = await res.json();
        return data.user;
      }
    } catch (err) {
      console.error('Не удалось получить данные профиля:', err);
    }
    return null;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.replace('/login.html');
    }
  },

  async initHeader() {
    const userNameEl = document.getElementById('userName');
    const welcomeEl = document.getElementById('welcomeText');

    if (!userNameEl && !welcomeEl) return;

    const user = await this.getMe();

    if (user) {
      if (userNameEl) {
        userNameEl.innerHTML = `
          <div class="user-info">
            <span>👋 <b>${user.username}</b></span>
            <button id="globalLogoutBtn" class="btn-logout">Выйти</button>
          </div>
        `;
        document.getElementById('globalLogoutBtn')?.addEventListener('click', () => {
          API.logout();
        });
      }
      if (welcomeEl) {
        welcomeEl.textContent = `Привет, ${user.username}!`;
      }
    } else {
      if (userNameEl) {
        userNameEl.innerHTML = `<a href="/login.html" class="btn-primary" style="padding: 6px 14px; font-size: 13px; text-decoration: none; display: inline-block;">Войти</a>`;
      }
      if (welcomeEl) {
        welcomeEl.textContent = 'Добро пожаловать в Damir Online School!';
      }
    }
  },

  // Плавный переход между страницами через очистку состояния
  initPageTransitions() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a');
      if (target && target.href && target.href.startsWith(window.location.origin) && !target.hasAttribute('download') && target.target !== '_blank') {
        const url = target.href;
        if (url !== window.location.href) {
          e.preventDefault();
          // Мгновенная очистка тела страницы для предотвращения артефактов при переходе
          document.body.style.opacity = '0';
          document.body.style.transition = 'opacity 0.15s ease';
          setTimeout(() => {
            window.location.href = url;
          }, 150);
        }
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  API.initHeader();
  API.initPageTransitions();
});

window.API = API;