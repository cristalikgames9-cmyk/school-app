require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(filename) {
  try {
    const filePath = path.join(__dirname, 'data', filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// === API Авторизации ===
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { data: existing } = await supabase.from('users').select('id').ilike('username', username);
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Пользователь существует' });

    const { data: newUser, error } = await supabase.from('users').insert([{ username, password }]).select().single();
    if (error || !newUser) throw error;

    res.cookie('userId', String(newUser.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { data: users, error } = await supabase.from('users').select('*').ilike('username', username);
    
    if (error || !users || users.length === 0) return res.status(401).json({ error: 'Неверный логин' });
    
    const user = users.find(u => u.password === password);
    if (!user) return res.status(401).json({ error: 'Неверный пароль' });

    res.cookie('userId', String(user.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ЭТОТ БЛОК ВАЖЕН ДЛЯ РЕДИРЕКТА НА ГЛАВНОЙ
app.get('/api/auth/me', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.json({ user: null }); // Если нет куки, возвращаем null (сработает редирект)

  const { data: user } = await supabase.from('users').select('id, username').eq('id', userId).maybeSingle();
  res.json({ user: user || null });
});

// === API Предметов и Уроков ===
app.get('/api/subjects', (req, res) => {
  res.json(readJSON('subjects.json') || []);
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