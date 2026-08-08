const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Мидлвары
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Чтение JSON-файлов из папки ./data
function readDataJSON(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Ошибка чтения data/${filename}:`, e);
    return [];
  }
}

// 2. Запись JSON-файлов в папку ./data
function writeDataJSON(filename, data) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2), 'utf8');
}

// 3. Чтение файла урока (.md, .txt, .json) из папки ./data/lessons/
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
    // Очищаем от Markdown-блоков (```json ... ```)
    rawData = rawData.replace(/^```(?:json)?/gi, '').replace(/```$/gi, '').trim();
    return JSON.parse(rawData);
  } catch (err) {
    console.error(`Ошибка парсинга урока ${filePath}:`, err);
    return null;
  }
}

// 4. Валидация 4 типов заданий
function validateAnswer(task, userAnswer) {
  if (userAnswer === undefined || userAnswer === null) return false;

  // Одиночный выбор (normal)
  if (task.type === 'normal') {
    return String(userAnswer).trim().toUpperCase() === String(task.correctAnswer).trim().toUpperCase();
  }

  // Множественный выбор (multiple)
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

  // Текстовый ввод (text)
  if (task.type === 'text') {
    return String(userAnswer).trim().toLowerCase() === String(task.correctAnswer).trim().toLowerCase();
  }

  // Соотнесение блоков (block)
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

// --- API АВТОРИЗАЦИИ ---

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || username.length < 4 || username.length > 12 || password.length < 4 || password.length > 12) {
    return res.status(400).json({ error: 'Логин и пароль должны быть от 4 до 12 символов!' });
  }

  let users = readDataJSON('users.json');
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }

  const newUser = { id: Date.now().toString(), username, password };
  users.push(newUser);
  writeDataJSON('users.json', users);

  res.cookie('userId', newUser.id, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const users = readDataJSON('users.json');

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  res.cookie('userId', user.id, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: { id: user.id, username: user.username } });
});

app.get('/api/auth/me', (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ user: null });

  const users = readDataJSON('users.json');
  const user = users.find(u => u.id === userId);

  if (!user) return res.status(401).json({ user: null });
  res.json({ user: { id: user.id, username: user.username } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// --- API ПРЕДМЕТОВ И УРОКОВ ---

// Список всех предметов
app.get('/api/subjects', (req, res) => {
  const subjects = readDataJSON('subjects.json');
  res.json(subjects);
});

// Конкретный предмет и его уроки из data/lessons.json
app.get('/api/subjects/:id', (req, res) => {
  const subjects = readDataJSON('subjects.json');
  const subject = subjects.find(s => s.id === req.params.id);

  if (!subject) {
    return res.status(404).json({ error: 'Предмет не найден' });
  }

  const allLessons = readDataJSON('lessons.json');
  const subjectLessons = allLessons.filter(l => l.subjectId === subject.id);

  res.json({ subject, lessons: subjectLessons });
});

// Чтение файла урока по ID из data/lessons/
app.get('/api/lessons/:id', (req, res) => {
  const lessonData = getLessonFile(req.params.id);

  if (!lessonData) {
    return res.status(404).json({ error: 'Файл урока не найден в data/lessons/' });
  }

  // Безопасный ответ без правильных ответов
  const safeLesson = {
    ...lessonData,
    tasks: (lessonData.tasks || []).map(t => {
      const { correctAnswer, ...taskWithoutAnswer } = t;
      return taskWithoutAnswer;
    })
  };

  res.json(safeLesson);
});

// --- API ПРОВЕРКИ И СОХРАНЕНИЯ ДОМАШНИХ ЗАДАНИЙ ---

app.post('/api/homework/submit', (req, res) => {
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

  // Сохраняем результат в data/results.json
  let results = readDataJSON('results.json');
  results.push({
    userId,
    lessonId,
    score: correctCount,
    total: totalCount,
    isSuccess,
    date: new Date().toISOString()
  });
  writeDataJSON('results.json', results);

  res.json({
    success: isSuccess,
    score: correctCount,
    total: totalCount
  });
});

// Запуск
app.listen(PORT, () => {
  console.log(`🚀 Сервер школы запущен на порту ${PORT}`);
});