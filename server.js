require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { getCorrectOptions, gradeAnswer, toPublicTask } = require('./lib/answer-grading');
const { calculateProgress } = require('./lib/progress');
const { createMailerLiteClient } = require('./lib/mailerlite');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LESSONS_DIR = path.join(DATA_DIR, 'lessons');
const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE || 'America/Costa_Rica';

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);
const mailerLite = createMailerLiteClient();

const COOKIE_SECRET = process.env.COOKIE_SECRET || 'insecure-default-secret-change-me';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
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
  secure: process.env.NODE_ENV === 'production',
};

const USER_PUBLIC_FIELDS =
  'id, username, student_name, parent_email, marketing_consent, marketing_consent_at, marketing_consent_ip, progress_month, progress_synced_at, mailerlite_synced_at, mailerlite_sync_error';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function toMailerLiteDate(value) {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || null;
}

async function getAnswersForUser(userId) {
  const { data, error } = await supabase
    .from('homework_results')
    .select('lesson_id, question_id, status, selected_options, created_at')
    .eq('user_id', String(userId));
  if (error) throw error;
  return data || [];
}

async function calculateUserProgress(userId) {
  return calculateProgress({
    answers: await getAnswersForUser(userId),
    lessons: loadAllLessons(),
    timeZone: REPORT_TIME_ZONE,
  });
}

async function syncProgress(user, progress) {
  const monthly = progress.monthly;
  const update = {
    progress_month: monthly.month,
    lessons_completed_month: monthly.lessonsCompleted,
    tasks_answered_month: monthly.tasksAnswered,
    correct_month: monthly.correct,
    partial_month: monthly.partial,
    incorrect_month: monthly.incorrect,
    score_month: monthly.score,
    progress_synced_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('users').update(update).eq('id', user.id);
  if (error) throw error;

  if (!user.marketing_consent || !user.parent_email) return;
  try {
    const result = await mailerLite.syncSubscriber({
      email: user.parent_email,
      studentName: user.student_name || user.username,
      stats: monthly,
      optIn: user.marketing_consent_at
        ? { at: toMailerLiteDate(user.marketing_consent_at), ip: user.marketing_consent_ip || undefined }
        : undefined,
    });
    if (!result.skipped) {
      await supabase
        .from('users')
        .update({ mailerlite_synced_at: new Date().toISOString(), mailerlite_sync_error: null })
        .eq('id', user.id);
    }
  } catch (error) {
    await supabase
      .from('users')
      .update({ mailerlite_sync_error: String(error.message || error).slice(0, 500) })
      .eq('id', user.id);
    throw error;
  }
}

function syncProgressInBackground(user, progress) {
  setImmediate(() => {
    syncProgress(user, progress).catch((error) => {
      console.error('progress sync error:', error.message || error);
    });
  });
}

async function getCurrentUser(req) {
  const userId = req.signedCookies.userId;
  if (!userId) return null;
  const { data: user, error } = await supabase.from('users').select(USER_PUBLIC_FIELDS).eq('id', userId).maybeSingle();
  if (error) {
    console.error('getCurrentUser: ошибка запроса к Supabase:', error.message);
    return null;
  }
  if (!user) {
    console.warn(`getCurrentUser: кука есть (userId=${userId}), но пользователь с таким id не найден в таблице users`);
  }
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
    const studentName = String(req.body.studentName || '').trim().replace(/\s+/g, ' ');
    const parentEmail = String(req.body.parentEmail || '').trim().toLowerCase();
    const marketingConsent = req.body.marketingConsent === true;

    if (username.length < 4 || username.length > 20) {
      return res.status(400).json({ error: 'Логин должен быть от 4 до 20 символов' });
    }
    if (!/^[\p{L}\p{N}_.-]+$/u.test(username)) {
      return res.status(400).json({ error: 'В логине разрешены буквы, цифры, точка, дефис и подчёркивание' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Новый пароль должен быть от 8 до 72 символов' });
    }
    if (studentName.length < 2 || studentName.length > 60) {
      return res.status(400).json({ error: 'Укажите имя ученика (от 2 до 60 символов)' });
    }
    if (parentEmail && !isValidEmail(parentEmail)) {
      return res.status(400).json({ error: 'Укажите корректный email родителя' });
    }
    if (marketingConsent && !parentEmail) {
      return res.status(400).json({ error: 'Чтобы получать письма, укажите email родителя' });
    }

    const { data: existing, error: findErr } = await supabase.from('users').select('id').ilike('username', username);
    if (findErr) throw findErr;
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Пользователь существует' });

    const passwordHash = await bcrypt.hash(password, 10);
    const consentAt = marketingConsent ? new Date().toISOString() : null;
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          username,
          password: passwordHash,
          student_name: studentName,
          parent_email: parentEmail || null,
          marketing_consent: marketingConsent,
          newsletter_subscribed: marketingConsent,
          marketing_consent_at: consentAt,
          marketing_consent_ip: marketingConsent ? getRequestIp(req) : null,
        },
      ])
      .select(USER_PUBLIC_FIELDS)
      .single();
    if (error || !newUser) throw error || new Error('Не удалось создать пользователя');

    res.cookie('userId', String(newUser.id), COOKIE_OPTIONS);
    const progress = calculateProgress({ lessons: loadAllLessons(), timeZone: REPORT_TIME_ZONE });
    syncProgressInBackground(newUser, progress);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('register error:', err.message || err);
    res.status(500).json({ error: 'Ошибка регистрации (проверь настройки Supabase — см. README)' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const { data: users, error } = await supabase
      .from('users')
      .select(`${USER_PUBLIC_FIELDS}, password`)
      .ilike('username', username);
    if (error) throw error;
    if (!users || users.length === 0) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const user = users[0];
    const passwordOk = await bcrypt.compare(password, user.password || '');
    if (!passwordOk) return res.status(401).json({ error: 'Неверный логин или пароль' });

    res.cookie('userId', String(user.id), COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    console.error('login error:', err.message || err);
    res.status(500).json({ error: 'Ошибка входа (проверь настройки Supabase — см. README)' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userId', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  // Сначала строго проверяем авторизацию — независимо от того, получится
  // ли посчитать прогресс. Раньше ошибка в блоке ниже (например, если
  // таблицы homework_results ещё нет в Supabase) "маскировала" уже успешный вход,
  // и авторизованный пользователь ошибочно выглядел как гость.
  const user = await getCurrentUser(req);
  if (!user) return res.json({ user: null });

  try {
    const allLessons = loadAllLessons();
    const progress = await calculateUserProgress(user.id);
    const monthChanged = user.progress_month !== progress.monthly.month;
    const directMailerLiteRetryNeeded =
      mailerLite.enabled &&
      user.marketing_consent &&
      (!user.mailerlite_synced_at ||
        (user.progress_synced_at && new Date(user.mailerlite_synced_at) < new Date(user.progress_synced_at)));
    if (monthChanged || directMailerLiteRetryNeeded) syncProgressInBackground(user, progress);

    res.json({
      user: { id: user.id, username: user.username, studentName: user.student_name || user.username },
      totalLessons: allLessons.length,
      completedLessons: progress.completedLessons,
      completedLessonIds: progress.completedLessonIds,
      monthly: progress.monthly,
    });
  } catch (err) {
    // Прогресс не посчитался (например, нет таблицы homework_results в Supabase) —
    // но пользователь точно вошёл, поэтому user всё равно возвращаем.
    console.error('me: ошибка подсчёта прогресса (проверь таблицу homework_results в Supabase):', err.message || err);
    res.json({
      user: { id: user.id, username: user.username, studentName: user.student_name || user.username },
      totalLessons: 0,
      completedLessons: 0,
      completedLessonIds: [],
      monthly: null,
    });
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

app.get('/api/homework/:lessonId', requireAuth, async (req, res) => {
  const lesson = loadAllLessons().find((l) => String(l.id) === String(req.params.lessonId));
  if (!lesson || !lesson.tasks) return res.status(404).json({ error: 'Задание не найдено' });

  // Сохранённые ответы — best-effort: если Supabase недоступна или таблицы
  // homework_results ещё нет, всё равно показываем задания, просто без пометок о
  // том, что уже отвечено (раньше это валило всю страницу ошибкой 500).
  let savedAnswers = [];
  try {
    const { data, error } = await supabase
      .from('homework_results')
      .select('question_id, status, selected_options')
      .eq('user_id', String(req.user.id))
      .eq('lesson_id', req.params.lessonId);
    if (error) throw error;
    savedAnswers = (data || []).map((answer) => {
      const task = lesson.tasks.find((item) => String(item.id) === String(answer.question_id));
      return { ...answer, correct_options: getCorrectOptions(task) };
    });
  } catch (err) {
    console.error(
      'homework get: не удалось получить сохранённые ответы (проверь таблицу homework_results в Supabase):',
      err.message || err
    );
  }

  res.json({ tasks: lesson.tasks.map(toPublicTask), savedAnswers });
});

app.post('/api/homework/:lessonId/submit', requireAuth, async (req, res) => {
  try {
    const { questionId, selectedOptions } = req.body;
    if (!questionId || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Недостаточно данных' });
    }

    const lesson = loadAllLessons().find((item) => String(item.id) === String(req.params.lessonId));
    const task = lesson?.tasks?.find((item) => String(item.id) === String(questionId));
    if (!task) return res.status(404).json({ error: 'Вопрос не найден' });

    let status;
    try {
      status = gradeAnswer(task, selectedOptions);
    } catch (error) {
      if (error.message === 'INVALID_ANSWER') return res.status(400).json({ error: 'Некорректный ответ' });
      throw error;
    }

    const { error } = await supabase.from('homework_results').insert(
      {
        user_id: String(req.user.id),
        lesson_id: req.params.lessonId,
        question_id: String(questionId),
        status,
        selected_options: selectedOptions,
      }
    );
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Этот ответ уже был сохранён' });
    }
    if (error) throw error;

    const progress = await calculateUserProgress(req.user.id);
    syncProgressInBackground(req.user, progress);
    res.json({ ok: true, status, correctOptions: getCorrectOptions(task), monthly: progress.monthly });
  } catch (err) {
    console.error('homework submit error:', err.message || err);
    res.status(500).json({ error: 'Не получилось сохранить ответ' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📚 Найдено уроков: ${loadAllLessons().length}`);
});
