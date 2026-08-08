/* === ЕДИНЫЙ МОДУЛЬ ДЛЯ РАБОТЫ С API И АВТОРИЗАЦИЕЙ === */

const API = {
  // Универсальный хелпер для отправки запросов
  async request(url, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);
      
      // Если сессия истекла или не авторизован (на защищенных эндпоинтах)
      if (response.status === 401 && !window.location.pathname.includes('/auth')) {
        window.location.href = '/login.html';
        return null;
      }

      return response;
    } catch (error) {
      console.error(`Ошибка сетевого запроса (${url}):`, error);
      throw error;
    }
  },

  // Получение текущего пользователя
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

  // Выход из системы
  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/';
    }
  },

  // Автоматическая инициализация шапки (Приветствие + Кнопка «Выйти»)
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
        userNameEl.innerHTML = `<a href="/login.html" class="btn-primary" style="padding: 6px 12px; font-size: 13px;">Войти</a>`;
      }
    }
  }
};

// Автозапуск отрисовки шапки при загрузке любой страницы
document.addEventListener('DOMContentLoaded', () => {
  API.initHeader();
});

// Экспорт в глобальную область видимости
window.API = API;