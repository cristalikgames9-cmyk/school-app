const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Чтение файла урока (.md, .txt, .json) из data/lessons/
function getLessonFile(lessonId) {
  const lessonsDir = path.join(__dirname, 'data', 'lessons');
  const extensions = ['.md', '.txt', '.json'];

  if (!fs.existsSync(lessonsDir)) {
    fs.mkdirSync(lessonsDir, { recursive: true });
  }

  let filePath = null;
  for (const ext of extensions) {
    const fullPath = path.join(lessonsDir, `${lessonId}${ext}`);
    if (fs.existsSync(fullPath)) {
      filePath = fullPath;
      break;
    }
  }

  if (!filePath) return null;

  try {
    let rawData = fs.readFileSync(filePath, 'utf8').trim();
    // Очистка от тройных кавычек Markdown ```json ... ```
    rawData = rawData.replace(/^```(?:json)?/gi, '').replace(/```$/gi, '').trim();
    return JSON.parse(rawData);
  } catch (err) {
    console.error(`Ошибка парсинга урока ${filePath}:`, err);
    return null;
  }
}

// Валидация 4 типов заданий
function validateAnswer(task, userAnswer) {
  if (userAnswer === undefined || userAnswer === null) return false;

  if (task.type === 'normal') {
    return String(userAnswer).trim().toUpperCase() === String(task.correctAnswer).trim().toUpperCase();
  }

  if (task.type === 'multiple') {
    if (!Array.isArray(userAnswer)) return false;
    const userSet = new Set(userAnswer.map(a => String(a).trim().toUpperCase()));
    const correctSet = new Set(task.correctAnswer.map(a => String(a).trim().toUpperCase()));
    if (userSet.size !== correctSet.size) return false;
    for (let item of userSet) {
      if (!correctSet.has(item)) return false;
    }
    return true;
  }

  if (task.type === 'text') {
    return String(userAnswer).trim().toLowerCase() === String(task.correctAnswer).trim().toLowerCase();
  }

  if (task.type === 'block') {
    if (typeof userAnswer !== 'object' || userAnswer === null) return false;
    const itemKeys = Object.keys(task.correctAnswer);
    for (let key of itemKeys) {
      const userVal = String(userAnswer[key] || '').trim().toLowerCase();
      const correctVal = String(task.correctAnswer[key]).trim().toLowerCase();
      if (userVal !== correctVal) return false;
    }
    return true;
  }

  return false;
}

// --- API АВТОРИЗАЦИИ (SUPABASE) ---

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || username.length < 4 || username.length > 12 || password.length < 4 || password.length > 12) {
      return res.status(400).json({ error: 'Логин и пароль должны быть от 4 до 12 символов!' });
    }

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ username: cleanUsername, password: cleanPassword }])
      .select()
      .single();

    if (insertError || !newUser) {
      console.error('Ошибка записи в Supabase:', insertError);
      return res.status(500).json({ error: 'Ошибка сохранения в базу данных' });
    }

    res.cookie('userId', newUser.id, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    console.error('Ошибка сервера при регистрации:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все поля!' });
    }

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (String(user.password).trim() !== cleanPassword) {
      console.log(`[AUTH FAIL] Для "${cleanUsername}" введен пароль "${cleanPassword}", а в БД лежит "${user.password}"`);
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    res.cookie('userId', user.id, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Ошибка сервера при входе:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Данные текущего пользователя
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
    res.json({ user });
  } catch (err) {
    res.status(500).json({ user: null });
  }
});

// Выход
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// --- API ПРЕДМЕТОВ И УРОКОВ ---

app.get('/api/subjects', async (req, res) => {
  try {
    const { data: subjects } = await supabase.from('subjects').select('*');
    res.json(subjects || []);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения предметов' });
  }
});

app.get('/api/subjects/:id', async (req, res) => {
  try {
    const { data: subject } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }

    const { data: lessons } = await supabase
      .from('lessons')
      .select('*')
      .eq('subjectId', subject.id);

    res.json({ subject, lessons: lessons || [] });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/lessons/:id', (req, res) => {
  const lessonData = getLessonFile(req.params.id);

  if (!lessonData) {
    return res.status(404).json({ error: 'Файл урока не найден' });
  }

  const safeLesson = {
    ...lessonData,
    tasks: (lessonData.tasks || []).map(t => {
      const { correctAnswer, ...taskWithoutAnswer } = t;
      return taskWithoutAnswer;
    })
  };

  res.json(safeLesson);
});

// --- API ПРОВЕРКИ И СОХРАНЕНИЯ В SUPABASE ---

app.post('/api/homework/submit', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const { lessonId, answers } = req.body;
    const lessonData = getLessonFile(lessonId);

    if (!lessonData || !lessonData.tasks) {
      return res.status(400).json({ error: 'Урок не найден' });
    }

    let correctCount = 0;
    const totalCount = lessonData.tasks.length;

    lessonData.tasks.forEach(task => {
      const userAnswer = answers ? answers[task.id] : null;
      if (validateAnswer(task, userAnswer)) {
        correctCount++;
      }
    });

    const isSuccess = correctCount === totalCount;

    await supabase.from('results').insert([
      {
        user_id: userId,
        lesson_id: lessonId,
        score: correctCount,
        total: totalCount,
        is_success: isSuccess
      }
    ]);

    res.json({
      success: isSuccess,
      score: correctCount,
      total: totalCount
    });
  } catch (err) {
    console.error('Ошибка сохранения результатов:', err);
    res.status(500).json({ error: 'Ошибка сервера при отправке ДЗ' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});