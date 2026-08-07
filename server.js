require('dotenv').config(); // <-- Строго первой строкой!
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Хелпер чтения статических JSON (уроки и предметы)
function readJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', filename), 'utf-8'));
}

// Middleware аутентификации по кукам
async function authMiddleware(req, res, next) {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ error: 'Не авторизован' });

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', userId)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Сессия недействительна' });
  req.user = user;
  next();
}

/* AUTH ROUTES */

// Регистрация: латиница, пароль 4-12 символов
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Имя пользователя должно состоять только из английских букв и цифр' });
  }
  if (!/^[a-zA-Z0-9]{4,12}$/.test(password)) {
    return res.status(400).json({ error: 'Пароль должен содержать от 4 до 12 символов (буквы/цифры)' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('users')
    .insert([{ username, password: hashedPassword }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Пользователь уже существует' });
    return res.status(500).json({ error: 'Ошибка сервера' });
  }

  // Куки на 30 дней
  res.cookie('userId', data.id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
  res.json({ id: data.id, username: data.username });
});

// Авторизация
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
  }

  res.cookie('userId', user.id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
  res.json({ id: user.id, username: user.username });
});

// Выход
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// Данные профиля и прогресс
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const { data: results } = await supabase
    .from('results')
    .select('lesson_id, score')
    .eq('user_id', req.user.id);

  const lessons = readJSON('lessons.json');
  const totalLessons = lessons.length;
  const completedLessons = new Set(results?.map(r => r.lesson_id) || []).size;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  res.json({
    user: req.user,
    progress: {
      completed: completedLessons,
      total: totalLessons,
      percent: progressPercent
    }
  });
});

/* CONTENT ROUTES */

app.get('/api/subjects', (req, res) => res.json(readJSON('subjects.json')));

app.get('/api/subjects/:id', (req, res) => {
  const subjects = readJSON('subjects.json');
  const lessons = readJSON('lessons.json');
  const subject = subjects.find(s => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: 'Не найдено' });
  res.json({ subject, lessons: lessons.filter(l => l.subjectId === req.params.id) });
});

app.get('/api/lessons/:id', (req, res) => {
  const lesson = readJSON('lessons.json').find(l => l.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });
  res.json(lesson);
});

app.get('/api/homework/:lessonId', (req, res) => {
  const hw = readJSON('homeworks.json').find(h => h.lessonId === req.params.lessonId);
  if (!hw) return res.status(404).json({ error: 'Задание не найдено' });
  res.json(hw.tasks);
});

// Сохранение результатов в Supabase
app.post('/api/results', authMiddleware, async (req, res) => {
  const { lessonId, answers, score } = req.body;

  const { error } = await supabase.from('results').insert([{
    user_id: req.user.id,
    lesson_id: lessonId,
    answers,
    score
  }]);

  if (error) return res.status(500).json({ error: 'Не удалось сохранить результат' });
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));