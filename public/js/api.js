window.API = {
  async request(url, options = {}) {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options
    };

    try {
      const res = await fetch(url, config);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка сети');
      return data;
    } catch (err) {
      console.error(`API Error [${url}]:`, err.message);
      throw err;
    }
  },

  get(url) {
    return this.request(url, { method: 'GET' });
  },

  post(url, body) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};