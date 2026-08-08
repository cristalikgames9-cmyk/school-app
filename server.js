const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Ошибка чтения ${filename}:`, e);
    return [];
  }
}

// --- API Авторизации ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .ilike('username', cleanUser);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ username: cleanUser, password: cleanPass }])
      .select()
      .single();

    if (error || !newUser) return res.status(500).json({ error: 'Ошибка регистрации в БД' });

    res.cookie('userId', String(newUser.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUser);

    if (error || !users || users.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const found = users.find(u => String(u.password).trim() === cleanPass);
    if (!found) return res.status(401).json({ error: 'Неверный логин или пароль' });

    res.cookie('userId', String(found.id), { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: found.id, username: found.username } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ user: null });

  const { data: user } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle();

  res.json({ user: user || null });
});

// --- API Предметов и Уроков ---
app.get('/api/subjects', (req, res) => {
  const subjects = readJSON('subjects.json');
  res.json(subjects);
});

app.get('/api/subjects/:id', (req, res) => {
  const subjects = readJSON('subjects.json');
  const targetId = String(req.params.id).trim().toLowerCase();
  
  const subject = subjects.find(s => String(s.id).trim().toLowerCase() === targetId);
  if (!subject) return res.status(404).json({ error: 'Предмет не найден' });

  const allLessons = readJSON('lessons.json');
  const lessons = allLessons.filter(l => String(l.subjectId).trim().toLowerCase() === targetId);

  res.json({ subject, lessons });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));