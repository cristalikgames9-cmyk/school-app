require('dotenv').config(); // Обязательно для чтения .env!
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Читаем переменные окружения. Если их нет, используем безопасные заглушки, чтобы сервер не падал.
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Безопасное чтение JSON
function readJSON(filename) {
  try {
    const filePath = path.join(__dirname, 'data', filename);
    if (!fs.existsSync(filePath)) return null;
    const fileData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileData);
  } catch (e) {
    console.error(`[Ошибка] Не удалось прочитать ${filename}:`, e);
    return null;
  }
}

// === API Авторизации ===
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const { data: existing } = await supabase.from('users').select('id').ilike('username', username);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ username, password }])
      .select()
      .single();

    if (error || !newUser) throw error;

    res.cookie('userId', String(newUser.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const { data: users, error } = await supabase.from('users').select('*').ilike('username', username);

    if (error || !users || users.length === 0) {
      return res.status(401).json({ error: 'Неверный логин' });
    }

    const user = users.find(u => u.password === password);
    if (!user) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    res.cookie('userId', String(user.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// === API Предметов и Уроков ===
app.get('/api/subjects', (req, res) => {
  const subjects = readJSON('subjects.json') || [];
  res.json(subjects);
});

app.get('/api/subjects/:id', (req, res) => {
  const subjectId = req.params.id;
  const subjects = readJSON('subjects.json') || [];
  const lessons = readJSON('lessons.json') || [];

  const subject = subjects.find(s => String(s.id) === String(subjectId));
  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

  const subjectLessons = lessons.filter(l => String(l.subjectId) === String(subjectId));
  res.json({ subject, lessons: subjectLessons });
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));