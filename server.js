const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ОШИБКА: Переменные SUPABASE_URL или SUPABASE_KEY не установлены!');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ДАННЫЕ И УРОКИ) ===

function readDataJSON(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Ошибка чтения data/${filename}:`, err);
    return [];
  }
}

// Рекурсивный поиск файлов уроков по всем вложенным категориям (math, lit, russian)
function findLessonFile(dir, lessonId) {
  if (!fs.existsSync(dir)) return null;
  const exts = ['.md', '.txt', '.json'];

  for (const ext of exts) {
    const directPath = path.join(dir, `${lessonId}${ext}`);
    if (fs.existsSync(directPath)) return directPath;
  }

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      const found = findLessonFile(path.join(dir, item.name), lessonId);
      if (found) return found;
    }
  }
  return null;
}

function loadLessonData(lessonId) {
  const lessonsDir = path.join(__dirname, 'data', 'lessons');
  const filePath = findLessonFile(lessonsDir, lessonId);
  if (!filePath) return null;

  try {
    let raw = fs.readFileSync(filePath, 'utf8').trim();
    raw = raw.replace(/^```(?:json)?/gi, '').replace(/```$/gi, '').trim();
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Ошибка парсинга урока ${filePath}:`, err);
    return null;
  }
}

function validateTaskAnswer(task, userAnswer) {
  if (userAnswer === undefined || userAnswer === null) return false;

  if (task.type === 'normal') {
    return String(userAnswer).trim().toUpperCase() === String(task.correctAnswer).trim().toUpperCase();
  }
  if (task.type === 'multiple') {
    if (!Array.isArray(userAnswer)) return false;
    const uSet = new Set(userAnswer.map(a => String(a).trim().toUpperCase()));
    const cSet = new Set(task.correctAnswer.map(a => String(a).trim().toUpperCase()));
    if (uSet.size !== cSet.size) return false;
    for (const item of uSet) if (!cSet.has(item)) return false;
    return true;
  }
  if (task.type === 'text') {
    return String(userAnswer).trim().toLowerCase() === String(task.correctAnswer).trim().toLowerCase();
  }
  if (task.type === 'block') {
    if (typeof userAnswer !== 'object' || userAnswer === null) return false;
    const keys = Object.keys(task.correctAnswer || {});
    for (const key of keys) {
      if (String(userAnswer[key] || '').trim().toLowerCase() !== String(task.correctAnswer[key]).trim().toLowerCase()) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// === API АВТОРИЗАЦИИ ===

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля!' });

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    if (cleanUser.length < 4 || cleanUser.length > 12 || cleanPass.length < 4 || cleanPass.length > 12) {
      return res.status(400).json({ error: 'Логин и пароль должны быть от 4 до 12 символов!' });
    }

    // Проверка дубликата
    const { data: existing, error: searchErr } = await supabase
      .from('users')
      .select('id')
      .ilike('username', cleanUser);

    if (searchErr) {
      console.error('Supabase DB Error:', searchErr);
      return res.status(500).json({ error: 'Ошибка подключения к БД' });
    }

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }

    // Создание
    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert([{ username: cleanUser, password: cleanPass }])
      .select()
      .single();

    if (insertErr || !newUser) {
      console.error('Supabase Insert Error:', insertErr);
      return res.status(500).json({ error: 'Не удалось зарегистрировать пользователя' });
    }

    res.cookie('userId', String(newUser.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    return res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    console.error('Register Exception:', err);
    return res.status(500).json({ error: 'Системная ошибка сервера' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля!' });

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    const { data: users, error: dbErr } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUser);

    if (dbErr) {
      console.error('Supabase Select Error:', dbErr);
      return res.status(500).json({ error: 'Ошибка базы данных Supabase' });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const foundUser = users.find(u => String(u.password).trim() === cleanPass);
    if (!foundUser) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    res.cookie('userId', String(foundUser.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    return res.json({ success: true, user: { id: foundUser.id, username: foundUser.username } });
  } catch (err) {
    console.error('Login Exception:', err);
    return res.status(500).json({ error: 'Системная ошибка авторизации' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) return res.status(401).json({ user: null });

    const { data: user } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return res.status(401).json({ user: null });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// === API КОНТЕНТА И ДЗ ===

app.get('/api/subjects', (req, res) => {
  res.json(readDataJSON('subjects.json'));
});

app.get('/api/subjects/:id', (req, res) => {
  const subjects = readDataJSON('subjects.json');
  const targetId = String(req.params.id);
  const subject = subjects.find(s => String(s.id) === targetId);

  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

  const allLessons = readDataJSON('lessons.json');
  const subjectLessons = allLessons.filter(l => String(l.subjectId) === targetId);

  res.json({ subject, lessons: subjectLessons });
});

app.get('/api/lessons/:id', (req, res) => {
  const lessonData = loadLessonData(req.params.id);
  if (!lessonData) return res.status(404).json({ error: 'Файл урока не найден' });

  const safeLesson = {
    ...lessonData,
    tasks: (lessonData.tasks || []).map(t => {
      const { correctAnswer, ...rest } = t;
      return rest;
    })
  };
  res.json(safeLesson);
});

app.post('/api/homework/submit', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) return res.status(401).json({ error: 'Авторизуйтесь для отправки ДЗ' });

    const { lessonId, answers } = req.body;
    const lessonData = loadLessonData(lessonId);
    if (!lessonData || !lessonData.tasks) return res.status(400).json({ error: 'Урок не найден' });

    let correctCount = 0;
    const totalCount = lessonData.tasks.length;

    lessonData.tasks.forEach(task => {
      if (validateTaskAnswer(task, answers ? answers[task.id] : null)) {
        correctCount++;
      }
    });

    const isSuccess = correctCount === totalCount;

    await supabase.from('results').insert([{
      user_id: userId,
      lesson_id: lessonId,
      score: correctCount,
      total: totalCount,
      is_success: isSuccess
    }]);

    res.json({ success: isSuccess, score: correctCount, total: totalCount });
  } catch (err) {
    console.error('Submit Error:', err);
    res.status(500).json({ error: 'Ошибка сохранения ДЗ' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));