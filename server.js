require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Хелпер чтения статических JSON-файлов
function readJSON(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Middleware аутентификации по кукам
async function authMiddleware(req, res, next) {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ error: 'Не авторизован' });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', userId)
      .single();

    if (error || !user) return res.status(401).json({ error: 'Сессия недействительна' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Ошибка проверки авторизации' });
  }
}

/* === МАРШРУТЫ АВТОРИЗАЦИИ (AUTH) === */

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Имя должно содержать только английские буквы и цифры' });
  }
  if (!/^[a-zA-Z0-9]{4,12}$/.test(password)) {
    return res.status(400).json({ error: 'Пароль должен содержать от 4 до 12 символов (буквы/цифры)' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword }])
      .select()
      .single();

    if (error) {
      console.error('Детали ошибки Supabase:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
      }
      return res.status(500).json({ error: error.message || 'Ошибка базы данных' });
    }

    // Установка куки на 30 дней
    res.cookie('userId', data.id, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.json({ id: data.id, username: data.username });
  } catch (err) {
    console.error('Системная ошибка регистрации:', err);
    res.status(500).json({ error: err.message });
  }
});

// Вход в аккаунт
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
    }

    res.cookie('userId', user.id, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

// Выход
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// Данные профиля и прогресс
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Ошибка получения /me:', err);
    res.status(500).json({ error: 'Ошибка получения профиля' });
  }
});

/* === МАРШРУТЫ КОНТЕНТА === */

// Список предметов
app.get('/api/subjects', (req, res) => {
  res.json(readJSON('subjects.json'));
});

// Предмет по ID + уроки
app.get('/api/subjects/:id', (req, res) => {
  const subjects = readJSON('subjects.json');
  const lessons = readJSON('lessons.json');
  const subject = subjects.find(s => s.id === req.params.id);

  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });
  res.json({ subject, lessons: lessons.filter(l => l.subjectId === req.params.id) });
});

// Урок по ID
app.get('/api/lessons/:id', (req, res) => {
  const lesson = readJSON('lessons.json').find(l => l.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });
  res.json(lesson);
});

// Домашнее задание по ID урока
app.get('/api/homework/:lessonId', (req, res) => {
  const hw = readJSON('homeworks.json').find(h => h.lessonId === req.params.lessonId);
  if (!hw) return res.status(404).json({ error: 'Задание не найдено' });
  res.json(hw.tasks);
});

// Сохранение результатов в Supabase
app.post('/api/results', authMiddleware, async (req, res) => {
  const { lessonId, answers, score } = req.body;

  try {
    const { error } = await supabase.from('results').insert([{
      user_id: req.user.id,
      lesson_id: lessonId,
      answers,
      score
    }]);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка сохранения результата:', err);
    res.status(500).json({ error: 'Не удалось сохранить результат' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});