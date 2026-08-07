async function api(url, options = {}) {
  options.headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  const res = await fetch('/api' + url, options);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}

async function checkAuth() {
  try {
    return await api('/auth/me');
  } catch (e) {
    return null;
  }
}