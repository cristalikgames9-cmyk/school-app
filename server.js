require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const rawUrl = process.env.SUPABASE_URL || '';
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const supabase = createClient(
  cleanUrl,
  process.env.SUPABASE_KEY || ''
);

app.use(express.json());
app.use(cookieParser());

// Главное исправление: абсолютный путь к статической папке public
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadLessonsFromFiles() {
  const lessonsDir = path.join(__dirname, 'data', 'lessons');
  if (!fs.existsSync(lessonsDir)) return [];

  const lessons = [];
  const subjects = fs.readdirSync(lessonsDir);

  subjects.forEach(subjectId => {
    const subjectPath = path.join(lessonsDir, subjectId);
    if (!fs.statSync(subjectPath).isDirectory()) return;

    const files = fs.readdirSync(subjectPath);
    files.forEach(file => {
      if (!file.endsWith('.txt')) return;

      const filePath = path.join(subjectPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parts = content.split('---').map(p => p.trim());

      let title = 'Без названия';
      let video = '';

      if (parts[0]) {
        parts[0].split('\n').forEach(line => {
          if (line.startsWith('TITLE:')) title = line.replace('TITLE:', '').trim();
          if (line.startsWith('VIDEO:')) video = line.replace('VIDEO:', '').trim();
        });
      }

      const description = parts[1] || '';
      const tasks = [];

      if (parts[2]) {
        const rawTasks = parts[2].split(/Q:/g).filter(t => t.trim());

        rawTasks.forEach((taskBlock, index) => {
          const lines = taskBlock.trim().split('\n');
          const question = lines[0] ? lines[0].trim() : '';
          let img = '';
          let options = [];
          let answer = [];

          lines.slice(1).forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('IMG:')) {
              img = trimmed.replace('IMG:', '').trim();
            } else if (trimmed.startsWith('O:')) {
              options = trimmed.replace('O:', '').split('|').map(o => o.trim());
            } else if (trimmed.startsWith('A:')) {
              answer = trimmed.replace('A:', '').split('|').map(a => a.trim());
            }
          });

          if (question) {
            tasks.push({
              id: index + 1,
              question,
              image: img || null,
              options,
              answer
            });
          }
        });
      }

      const lessonId = `${subjectId}_${file.replace('.txt', '')}`;
      lessons.push({
        id: lessonId,
        subjectId,
        title,
        video,
        description,
        tasks
      });
    });
  });

  return lessons;
}

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

/* === МАРШРУТЫ HTML СТРАНИЦ === */
app.get('/subject.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subject.html'));
});

app.get('/lesson.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lesson.html'));
});

/* === МАРШРУТЫ API === */
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: 'Пользователь уже существует' });

    res.cookie('userId', data.id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    res.json({ id: data.id, username: data.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) return res.status(400).json({ error: 'Неверные данные' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Неверные данные' });

    res.cookie('userId', user.id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/subjects', (req, res) => {
  res.json(readJSON('subjects.json'));
});

app.get('/api/subjects/:id', (req, res) => {
  const subjects = readJSON('subjects.json');
  const subject = subjects.find(s => s.id === req.params.id);

  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

  const allLessons = loadLessonsFromFiles();
  const subjectLessons = allLessons.filter(l => l.subjectId === req.params.id);

  res.json({ subject, lessons: subjectLessons });
});

app.get('/api/lessons/:id', (req, res) => {
  const allLessons = loadLessonsFromFiles();
  const lesson = allLessons.find(l => l.id === req.params.id);

  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });
  res.json(lesson);
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
/* === МАРШРУТЫ ДЗ === */
app.get('/homework.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'homework.html'));
});

// Получить вопросы ДЗ и сохраненный прогресс
app.get('/api/homework/:lessonId', authMiddleware, async (req, res) => {
  const { lessonId } = req.params;
  const allLessons = loadLessonsFromFiles();
  const lesson = allLessons.find(l => l.id === lessonId);

  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });

  try {
    const { data: savedAnswers } = await supabase
      .from('homework_results')
      .select('*')
      .eq('user_id', String(req.user.id))
      .eq('lesson_id', lessonId);

    res.json({
      lessonTitle: lesson.title,
      tasks: lesson.tasks || [],
      savedAnswers: savedAnswers || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Сохранить ответ на вопрос
app.post('/api/homework/:lessonId/submit', authMiddleware, async (req, res) => {
  const { lessonId } = req.params;
  const { questionId, status, selectedOptions } = req.body;

  try {
    const { error } = await supabase
      .from('homework_results')
      .upsert({
        user_id: String(req.user.id),
        lesson_id: lessonId,
        question_id: Number(questionId),
        status: status, // 'correct', 'partial', 'incorrect'
        selected_options: selectedOptions
      }, { onConflict: 'user_id,lesson_id,question_id' });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/* === ПОДСЧЁТ ПРОГРЕССА ПОЛЬЗОВАТЕЛЯ === */
async function getUserProgress(userId) {
  if (!userId) return { completedLessons: new Set(), completedSubjects: new Set() };

  try {
    const { data: results } = await supabase
      .from('homework_results')
      .select('lesson_id, question_id')
      .eq('user_id', String(userId));

    if (!results) return { completedLessons: new Set(), completedSubjects: new Set() };

    const allLessons = loadLessonsFromFiles();
    const completedLessons = new Set();

    // Группируем отвеченные вопросы по урокам
    const answeredMap = {};
    results.forEach(r => {
      if (!answeredMap[r.lesson_id]) answeredMap[r.lesson_id] = new Set();
      answeredMap[r.lesson_id].add(r.question_id);
    });

    // Урок считается пройденным, если отвечены все его вопросы
    allLessons.forEach(lesson => {
      const taskCount = lesson.tasks ? lesson.tasks.length : 0;
      const answeredCount = answeredMap[lesson.id] ? answeredMap[lesson.id].size : 0;
      if (taskCount > 0 && answeredCount >= taskCount) {
        completedLessons.add(lesson.id);
      }
    });

    // Курс/предмет считается пройденным, если все его уроки выполнены
    const subjects = readJSON('subjects.json');
    const completedSubjects = new Set();

    subjects.forEach(sub => {
      const subLessons = allLessons.filter(l => l.subjectId === sub.id);
      if (subLessons.length > 0) {
        const allDone = subLessons.every(l => completedLessons.has(l.id));
        if (allDone) completedSubjects.add(sub.id);
      }
    });

    return { completedLessons, completedSubjects };
  } catch (err) {
    return { completedLessons: new Set(), completedSubjects: new Set() };
  }
}

/* === МАРШРУТ ВЫХОДА ИЗ АККАУНТА === */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

/* === ОБНОВЛЕННЫЕ МАРШРУТЫ ПРЕДМЕТОВ И УРОКОВ === */
app.get('/api/subjects', async (req, res) => {
  const subjects = readJSON('subjects.json');
  const userId = req.cookies.userId;
  const { completedSubjects } = await getUserProgress(userId);

  const result = subjects.map(s => ({
    ...s,
    isCompleted: completedSubjects.has(s.id)
  }));

  res.json(result);
});

app.get('/api/subjects/:id', async (req, res) => {
  const subjects = readJSON('subjects.json');
  const subject = subjects.find(s => s.id === req.params.id);

  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

  const allLessons = loadLessonsFromFiles();
  const subjectLessons = allLessons.filter(l => l.subjectId === req.params.id);

  const userId = req.cookies.userId;
  const { completedLessons, completedSubjects } = await getUserProgress(userId);

  const lessonsWithProgress = subjectLessons.map(l => ({
    ...l,
    isCompleted: completedLessons.has(l.id)
  }));

  res.json({
    subject: {
      ...subject,
      isCompleted: completedSubjects.has(subject.id)
    },
    lessons: lessonsWithProgress
  });
});