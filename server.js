const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- helpers ----------------------------------------------------------
function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

function readResults() {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeResults(results) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

// ---- API ----------------------------------------------------------------

// Список предметов
app.get('/api/subjects', (req, res) => {
  res.json(readJSON('subjects.json'));
});

// Предмет + список его уроков
app.get('/api/subjects/:id', (req, res) => {
  const subjects = readJSON('subjects.json');
  const lessonsBySubject = readJSON('lessons.json');
  const subject = subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });
  res.json({ subject, lessons: lessonsBySubject[req.params.id] || [] });
});

// Один урок по id
app.get('/api/lessons/:id', (req, res) => {
  const lessonsBySubject = readJSON('lessons.json');
  for (const subjectId of Object.keys(lessonsBySubject)) {
    const lesson = lessonsBySubject[subjectId].find((l) => l.id === req.params.id);
    if (lesson) return res.json({ ...lesson, subjectId });
  }
  res.status(404).json({ error: 'Урок не найден' });
});

// Домашнее задание (7 задач) для урока
app.get('/api/homework/:lessonId', (req, res) => {
  const homeworks = readJSON('homeworks.json');
  const tasks = homeworks[req.params.lessonId];
  if (!tasks) return res.status(404).json({ error: 'Задание не найдено' });
  res.json(tasks);
});

// Сохранить результат прохождения домашнего задания
app.post('/api/results', (req, res) => {
  const { studentId, studentName, lessonId, answers, score } = req.body;
  if (!studentId || !lessonId || !answers) {
    return res.status(400).json({ error: 'Недостаточно данных' });
  }
  const results = readResults();
  results.push({
    studentId,
    studentName: studentName || 'Ученик',
    lessonId,
    answers,
    score,
    completedAt: new Date().toISOString(),
  });
  writeResults(results);
  res.json({ ok: true });
});

// Получить последнюю попытку ученика по конкретному уроку
app.get('/api/results/:studentId/:lessonId', (req, res) => {
  const results = readResults();
  const attempts = results.filter(
    (r) => r.studentId === req.params.studentId && r.lessonId === req.params.lessonId
  );
  if (attempts.length === 0) return res.json(null);
  res.json(attempts[attempts.length - 1]);
});

app.listen(PORT, () => {
  console.log(`Онлайн-школа запущена: http://localhost:${PORT}`);
});
