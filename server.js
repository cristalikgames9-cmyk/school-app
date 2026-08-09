require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LESSONS_DIR = path.join(DATA_DIR, 'lessons');

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);

const COOKIE_SECRET = process.env.COOKIE_SECRET || 'insecure-default-secret-change-me';

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

// /api/* никогда не должен кэшироваться браузером/прокси — иначе после
// логина можно на миг увидеть старый "неавторизован" ответ.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

function readJSON(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// --- Загрузка уроков из data/lessons/<subjectId>/*.txt --------------------
// Каждый файл — это JSON одного урока (title, videoUrl, content, tasks[...]).
// Название папки — просто для порядка на диске, реальная привязка урока к
// предмету идёт по полю "subjectId" внутри самого файла.
let lessonsCache = null;
let lessonsCacheAt = 0;
const LESSONS_CACHE_TTL = 3000; // мс — чтобы не перечитывать диск на каждый чих

function loadAllLessons() {
  const now = Date.now();
  if (lessonsCache && now - lessonsCacheAt < LESSONS_CACHE_TTL) return lessonsCache;

  const lessons = [];
  const seenIds = new Map();

  if (fs.existsSync(LESSONS_DIR)) {
    const subjectDirs = fs.readdirSync(LESSONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const dirEntry of subjectDirs) {
      const subjectFolder = dirEntry.name;
      const subjectPath = path.join(LESSONS_DIR, subjectFolder);
      const files = fs
        .readdirSync(subjectPath)
        .filter((f) => f.endsWith('.txt') || f.endsWith('.json'))
        .sort(); // называй файлы "01-...", "02-..." для правильного порядка уроков

      for (const file of files) {
        const filePath = path.join(subjectPath, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const lesson = JSON.parse(raw);

          if (!lesson.id) {
            console.warn(`⚠️  Урок без "id" пропущен: ${filePath}`);
            continue;
          }
          if (!lesson.subjectId) lesson.subjectId = subjectFolder; // подстраховка

          if (seenIds.has(lesson.id)) {
            console.warn(
              `⚠️  Дублирующийся id урока "${lesson.id}" в файлах ${seenIds.get(lesson.id)} и ${filePath} — ` +
                `будет использован первый найденный. Сделай id уникальным на весь сайт.`
            );
            continue;
          }

          seenIds.set(lesson.id, filePath);
          lessons.push(lesson);
        } catch (e) {
          console.error(`⚠️  Не удалось прочитать урок ${filePath}: ${e.message}`);
        }
      }
    }
  }

  lessonsCache = lessons;
  lessonsCacheAt = now;
  return lessons;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 30 * 24 * 3600 * 1000,
  sameSite: 'lax',
  signed: true,
};

async function getCurrentUser(req) {
  const userId = req.signedCookies.userId;
  if (!userId) return null;
  const { data: user } = await supabase.from('users').select('id, username').eq('id', userId).maybeSingle();
  return user || null;
}

async function requireAuth(req, res, next) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Нужно войти в аккаунт' });
  req.user = user;
  next();
}

// === API Авторизации =========================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username.length < 4 || username.length > 20) {
      return res.status(400).json({ error: 'Логин должен быть от 4 до 20 символов' });
    }
    if (password.length < 4 || password.length > 12) {
      return res.status(400).json({ error: 'Пароль должен быть от 4 до 12 символов' });
    }

    const { data: existing, error: findErr } = await supabase.from('users').select('id').ilike('username', username);
    if (findErr) throw findErr;
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Пользователь существует' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ username, password: passwordHash }])
      .select()
      .single();
    if (error || !newUser) throw error || new Error('Не удалось создать пользователя');

    res.cookie('userId', String(newUser.id), COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    console.error('register error:', err.message || err);
    res.status(500).json({ error: 'Ошибка регистрации (проверь настройки Supabase — см. README)' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const { data: users, error } = await supabase.from('users').select('*').ilike('username', username);
    if (error) throw error;
    if (!users || users.length === 0) return res.status(401).json({ error: 'Неверный логин' });

    const user = users[0];
    const passwordOk = await bcrypt.compare(password, user.password || '');
    if (!passwordOk) return res.status(401).json({ error: 'Неверный пароль' });

    res.cookie('userId', String(user.id), COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    console.error('login error:', err.message || err);
    res.status(500).json({ error: 'Ошибка входа (проверь настройки Supabase — см. README)' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.json({ user: null });

    const allLessons = loadAllLessons();
    const totalLessons = allLessons.length;

    const { data: answers, error } = await supabase
      .from('answers')
      .select('lesson_id, question_id')
      .eq('user_id', user.id);
    if (error) throw error;

    const answeredCountByLesson = {};
    (answers || []).forEach((a) => {
      answeredCountByLesson[a.lesson_id] = (answeredCountByLesson[a.lesson_id] || 0) + 1;
    });

    const lessonsById = Object.fromEntries(allLessons.map((l) => [l.id, l]));
    const completedLessonIds = Object.keys(answeredCountByLesson).filter((lessonId) => {
      const lesson = lessonsById[lessonId];
      const totalTasks = lesson && lesson.tasks ? lesson.tasks.length : 0;
      return totalTasks > 0 && answeredCountByLesson[lessonId] >= totalTasks;
    });

    res.json({
      user: { id: user.id, username: user.username },
      totalLessons,
      completedLessons: completedLessonIds.length,
      completedLessonIds,
    });
  } catch (err) {
    console.error('me error:', err.message || err);
    res.json({ user: null });
  }
});

// === API Предметов и Уроков ===================================================

app.get('/api/subjects', (req, res) => {
  res.json(readJSON('subjects.json') || []);
});

app.get('/api/subjects/:id', (req, res) => {
  const subjectId = req.params.id;
  const subjects = readJSON('subjects.json') || [];
  const subject = subjects.find((s) => String(s.id) === String(subjectId));
  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

  const subjectLessons = loadAllLessons()
    .filter((l) => String(l.subjectId) === String(subjectId))
    .map(({ tasks, ...rest }) => rest); // задачи на этой странице не нужны

  res.json({ subject, lessons: subjectLessons });
});

app.get('/api/lessons/:id', (req, res) => {
  const lesson = loadAllLessons().find((l) => String(l.id) === String(req.params.id));
  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });
  const { tasks, ...rest } = lesson;
  res.json(rest);
});

// === API Домашних заданий =====================================================

app.get('/api/homework/:lessonId', async (req, res) => {
  try {
    const lesson = loadAllLessons().find((l) => String(l.id) === String(req.params.lessonId));
    if (!lesson || !lesson.tasks) return res.status(404).json({ error: 'Задание не найдено' });

    let savedAnswers = [];
    const user = await getCurrentUser(req);
    if (user) {
      const { data, error } = await supabase
        .from('answers')
        .select('question_id, status, selected_options')
        .eq('user_id', user.id)
        .eq('lesson_id', req.params.lessonId);
      if (error) throw error;
      savedAnswers = data || [];
    }

    res.json({ tasks: lesson.tasks, savedAnswers });
  } catch (err) {
    console.error('homework get error:', err.message || err);
    res.status(500).json({ error: 'Ошибка загрузки задания' });
  }
});

app.post('/api/homework/:lessonId/submit', requireAuth, async (req, res) => {
  try {
    const { questionId, status, selectedOptions } = req.body;
    if (!questionId || !status || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Недостаточно данных' });
    }

    const { error } = await supabase.from('answers').upsert(
      {
        user_id: req.user.id,
        lesson_id: req.params.lessonId,
        question_id: questionId,
        status,
        selected_options: selectedOptions,
      },
      { onConflict: 'user_id,lesson_id,question_id' }
    );
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('homework submit error:', err.message || err);
    res.status(500).json({ error: 'Не получилось сохранить ответ' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📚 Найдено уроков: ${loadAllLessons().length}`);
});
