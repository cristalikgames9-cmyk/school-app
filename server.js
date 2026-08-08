const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Предупреждение: SUPABASE_URL или SUPABASE_KEY не найдены в переменных окружения.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 2. Вспомогательные функции для работы с локальной файловой системой

// Безопасное чтение JSON из папки /data/
function readDataJson(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(` Ошибка чтения data/${filename}:`, err);
    return [];
  }
}

// Рекурсивный поиск файла урока (.md, .txt, .json) во всей структуре data/lessons/
function findLessonFile(dir, lessonId) {
  if (!fs.existsSync(dir)) return null;

  const extensions = ['.md', '.txt', '.json'];

  // 1. Проверяем в текущей папке
  for (const ext of extensions) {
    const fullPath = path.join(dir, `${lessonId}${ext}`);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  // 2. Рекурсивно сканируем все подпапки (math, lit, russian и т.д.)
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      const found = findLessonFile(path.join(dir, item.name), lessonId);
      if (found) return found;
    }
  }

  return null;
}

// Парсинг файла урока
function loadLessonData(lessonId) {
  const lessonsDir = path.join(__dirname, 'data', 'lessons');
  const filePath = findLessonFile(lessonsDir, lessonId);

  if (!filePath) return null;

  try {
    let raw = fs.readFileSync(filePath, 'utf8').trim();
    // Очистка от блоков кода Markdown ```json ... ```
    raw = raw.replace(/^```(?:json)?/gi, '').replace(/```$/gi, '').trim();
    return JSON.parse(raw);
  } catch (err) {
    console.error(` Ошибка парсинга урока по пути ${filePath}:`, err);
    return null;
  }
}

// Проверка ответов пользователя для 4 типов заданий
function validateTaskAnswer(task, userAnswer) {
  if (userAnswer === undefined || userAnswer === null) return false;

  // Одиночный выбор
  if (task.type === 'normal') {
    return String(userAnswer).trim().toUpperCase() === String(task.correctAnswer).trim().toUpperCase();
  }

  // Множественный выбор
  if (task.type === 'multiple') {
    if (!Array.isArray(userAnswer)) return false;
    const uSet = new Set(userAnswer.map(a => String(a).trim().toUpperCase()));
    const cSet = new Set(task.correctAnswer.map(a => String(a).trim().toUpperCase()));
    if (uSet.size !== cSet.size) return false;
    for (const item of uSet) {
      if (!cSet.has(item)) return false;
    }
    return true;
  }

  // Текстовый ввод
  if (task.type === 'text') {
    return String(userAnswer).trim().toLowerCase() === String(task.correctAnswer).trim().toLowerCase();
  }

  // Соотнесение блоков
  if (task.type === 'block') {
    if (typeof userAnswer !== 'object' || userAnswer === null) return false;
    const keys = Object.keys(task.correctAnswer || {});
    for (const key of keys) {
      const uVal = String(userAnswer[key] || '').trim().toLowerCase();
      const cVal = String(task.correctAnswer[key]).trim().toLowerCase();
      if (uVal !== cVal) return false;
    }
    return true;
  }

  return false;
}

// 3. Маршруты авторизации (Supabase)

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все поля!' });
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    if (cleanUser.length < 4 || cleanUser.length > 12 || cleanPass.length < 4 || cleanPass.length > 12) {
      return res.status(400).json({ error: 'Логин и пароль должны быть от 4 до 12 символов!' });
    }

    // Проверка существования логина в БД
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .ilike('username', cleanUser);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    // Добавление аккаунта
    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert([{ username: cleanUser, password: cleanPass }])
      .select()
      .single();

    if (insertErr || !newUser) {
      console.error(' Ошибка создания пользователя в Supabase:', insertErr);
      return res.status(500).json({ error: 'Ошибка сохранения в базу данных' });
    }

    res.cookie('userId', String(newUser.id), {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    return res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    console.error('Ошибка сервера при регистрации:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все поля!' });
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    // Запрашиваем всех кандидатов по совпадению логина без учета регистра
    const { data: users, error: dbErr } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUser);

    if (dbErr) {
      console.error(' Ошибка обращения к Supabase:', dbErr);
      return res.status(500).json({ error: 'Ошибка базы данных' });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Поиск совпадения по паролю
    const foundUser = users.find(u => String(u.password).trim() === cleanPass);

    if (!foundUser) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    res.cookie('userId', String(foundUser.id), {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    return res.json({ success: true, user: { id: foundUser.id, username: foundUser.username } });
  } catch (err) {
    console.error('Ошибка сервера при входе:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение профиля
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

// Выход
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// 4. Маршруты предметов и уроков (Локальные JSON)

// Список предметов из data/subjects.json
app.get('/api/subjects', (req, res) => {
  const subjects = readDataJson('subjects.json');
  res.json(subjects);
});

// Предмет и его уроки из data/lessons.json
app.get('/api/subjects/:id', (req, res) => {
  const subjects = readDataJson('subjects.json');
  const targetId = String(req.params.id);

  const subject = subjects.find(s => String(s.id) === targetId);

  if (!subject) {
    return res.status(404).json({ error: 'Предмет не найден' });
  }

  const allLessons = readDataJson('lessons.json');
  const subjectLessons = allLessons.filter(l => String(l.subjectId) === targetId);

  res.json({ subject, lessons: subjectLessons });
});

// Получение контента конкретного урока по ID
app.get('/api/lessons/:id', (req, res) => {
  const lessonData = loadLessonData(req.params.id);

  if (!lessonData) {
    return res.status(404).json({ error: 'Файл урока не найден в папке data/lessons/' });
  }

  // Удаляем правильные ответы из отправляемого клиенту объекта
  const safeLesson = {
    ...lessonData,
    tasks: (lessonData.tasks || []).map(t => {
      const { correctAnswer, ...taskWithoutAnswer } = t;
      return taskWithoutAnswer;
    })
  };

  res.json(safeLesson);
});

// 5. Проверка ДЗ и запись результатов в Supabase

app.post('/api/homework/submit', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const { lessonId, answers } = req.body;
    const lessonData = loadLessonData(lessonId);

    if (!lessonData || !lessonData.tasks) {
      return res.status(400).json({ error: 'Урок не найден или не содержит заданий' });
    }

    let correctCount = 0;
    const totalCount = lessonData.tasks.length;

    lessonData.tasks.forEach(task => {
      const userAnswer = answers ? answers[task.id] : null;
      if (validateTaskAnswer(task, userAnswer)) {
        correctCount++;
      }
    });

    const isSuccess = correctCount === totalCount;

    // Запись результата в БД
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
    console.error('Ошибка сохранения ДЗ:', err);
    res.status(500).json({ error: 'Ошибка сервера при проверке ДЗ' });
  }
});

// Запуск
app.listen(PORT, () => {
  console.log(`🚀 Сервер школы запущен и работает на порту ${PORT}`);
});