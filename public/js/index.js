document.addEventListener('DOMContentLoaded', async () => {
  const subjectsList = document.getElementById('subjectsList');
  const userNameEl = document.getElementById('userName');
  const welcomeText = document.getElementById('welcomeText');
  const progressBox = document.getElementById('progressBox');
  const progressText = document.getElementById('progressText');
  const monthlyProgressBox = document.getElementById('monthlyProgressBox');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginBtn = document.getElementById('loginBtn');
  const calendar = initWeeklyCalendar();

  fetch('/api/calendar', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Не удалось загрузить расписание');
      return response.json();
    })
    .then((events) => calendar.setEvents(Array.isArray(events) ? events : []))
    .catch((error) => {
      console.error('Ошибка загрузки календаря:', error);
      calendar.setError('Не удалось загрузить расписание. Обновите страницу чуть позже.');
    });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => {});
      // После выхода остаёмся на главной как гость, а не улетаем на /login.html
      window.location.href = '/index.html';
    });
  }

  try {
    // cache: 'no-store' — критично: без этого браузер иногда отдаёт
    // закэшированный "гостевой" ответ сразу после логина/регистрации,
    // из-за чего на миг мелькает неавторизованное состояние.
    const authRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const authData = await authRes.json();

    if (authData.user) {
      const displayName = authData.user.studentName || authData.user.username;
      if (userNameEl) userNameEl.textContent = `👋 ${displayName}`;
      if (welcomeText) welcomeText.textContent = `Привет, ${displayName}!`;
      if (logoutBtn) logoutBtn.style.display = '';
      if (loginBtn) loginBtn.style.display = 'none';

      if (progressBox && progressText && authData.totalLessons > 0) {
        const pct = Math.round((authData.completedLessons / authData.totalLessons) * 100);
        progressText.innerHTML = `
          <div class="progress-top-row">
            <span>Твой прогресс</span>
            <span>${authData.completedLessons} из ${authData.totalLessons} · ${pct}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        `;
        progressBox.style.display = 'block';
      }

      if (monthlyProgressBox && authData.monthly) {
        const monthly = authData.monthly;
        const monthDate = new Date(`${monthly.month}-01T12:00:00Z`);
        const monthTitle = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(monthDate);
        document.getElementById('monthlyProgressTitle').textContent = `Результаты · ${monthTitle}`;
        document.getElementById('monthlyScore').textContent = monthly.score;
        document.getElementById('monthlyLessons').textContent = monthly.lessonsCompleted;
        document.getElementById('monthlyTasks').textContent = monthly.tasksAnswered;
        document.getElementById('monthlyCorrect').textContent = monthly.correct;
        document.getElementById('monthlyPartial').textContent = monthly.partial;
        document.getElementById('monthlyIncorrect').textContent = monthly.incorrect;
        monthlyProgressBox.style.display = 'block';
      }
    } else {
      // Гость: не редиректим, просто показываем кнопку "Войти" вместо ника
      if (userNameEl) userNameEl.textContent = '👋 Гость';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (loginBtn) loginBtn.style.display = '';
      if (progressBox) progressBox.style.display = 'none';
      if (monthlyProgressBox) monthlyProgressBox.style.display = 'none';
    }

    // Предметы видны всем — и гостям, и авторизованным.
    // При клике на предмет неавторизованного пользователя subject.js
    // сам отправит на страницу входа.
    const subjectsRes = await fetch('/api/subjects', { cache: 'no-store' });
    const subjects = await subjectsRes.json();

    if (!subjectsList) return;

    if (!subjects || subjects.length === 0) {
      subjectsList.innerHTML = '<p>Предметы не найдены.</p>';
      return;
    }

    subjectsList.innerHTML = subjects
      .map(
        (s) => `
      <a href="/subject.html?id=${s.id}" class="subject-card">
        <span class="subject-icon">${s.icon || '📘'}</span>
        ${s.grade ? `<span class="subject-eyebrow">${s.grade}</span>` : ''}
        <h3>${s.title || s.name}</h3>
      </a>
    `
      )
      .join('');
  } catch (err) {
    console.error('Ошибка загрузки главной страницы:', err);
    if (subjectsList) subjectsList.innerHTML = '<p style="color:red">Ошибка загрузки.</p>';
  }
});

function initWeeklyCalendar() {
  const calendarEl = document.getElementById('weeklyCalendar');
  const scrollEl = document.getElementById('calendarScroll');
  const weekTitleEl = document.getElementById('calendarWeekTitle');
  const statusEl = document.getElementById('calendarStatus');
  const previousButton = document.getElementById('calendarPrevWeek');
  const todayButton = document.getElementById('calendarToday');
  const nextButton = document.getElementById('calendarNextWeek');
  const now = new Date();
  const todayKey = toDateKey(now);
  let weekStart = getWeekStart(now);
  let events = [];
  let errorMessage = '';
  let didInitialScroll = false;

  function render() {
    if (!calendarEl || !weekTitleEl || !statusEl) return;

    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const dayKeys = days.map(toDateKey);
    const weekEvents = events.filter((event) => dayKeys.includes(event.date));
    const eventsBySlot = new Map();

    weekEvents.forEach((event) => {
      const slotKey = `${event.date}-${event.hour}`;
      if (!eventsBySlot.has(slotKey)) eventsBySlot.set(slotKey, []);
      eventsBySlot.get(slotKey).push(event);
    });

    weekTitleEl.textContent = formatWeekRange(days[0], days[6]);
    statusEl.textContent = errorMessage || (weekEvents.length === 0 ? 'На эту неделю уроков пока нет.' : '');
    statusEl.classList.toggle('calendar-status-error', Boolean(errorMessage));
    calendarEl.replaceChildren();

    const corner = document.createElement('div');
    corner.className = 'calendar-corner';
    corner.setAttribute('role', 'columnheader');
    corner.textContent = 'Время';
    calendarEl.append(corner);

    days.forEach((day) => {
      const dayKey = toDateKey(day);
      const header = document.createElement('div');
      header.className = 'calendar-day-header';
      header.setAttribute('role', 'columnheader');
      if (dayKey === todayKey) header.classList.add('is-today');

      const weekday = document.createElement('span');
      weekday.textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(day).replace('.', '');
      const date = document.createElement('strong');
      date.textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(day).replace('.', '');
      header.append(weekday, date);
      calendarEl.append(header);
    });

    for (let hour = 0; hour < 24; hour += 1) {
      const timeCell = document.createElement('div');
      timeCell.className = 'calendar-time-cell';
      timeCell.setAttribute('role', 'rowheader');
      timeCell.textContent = `${String(hour).padStart(2, '0')}:00`;
      calendarEl.append(timeCell);

      days.forEach((day) => {
        const dayKey = toDateKey(day);
        const cell = document.createElement('div');
        cell.className = 'calendar-hour-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `${formatFullDate(day)}, ${String(hour).padStart(2, '0')}:00`);
        if (dayKey === todayKey) cell.classList.add('is-today');

        const slotEvents = eventsBySlot.get(`${dayKey}-${hour}`) || [];
        slotEvents.forEach((event) => cell.append(createCalendarEvent(event)));

        if (dayKey === todayKey && hour === now.getHours()) {
          const nowLine = document.createElement('span');
          nowLine.className = 'calendar-now-line';
          nowLine.style.top = `${(now.getMinutes() / 60) * 100}%`;
          nowLine.setAttribute('aria-hidden', 'true');
          cell.append(nowLine);
        }

        calendarEl.append(cell);
      });
    }

    const endTime = document.createElement('span');
    endTime.className = 'calendar-end-time';
    endTime.textContent = '24:00';
    calendarEl.append(endTime);

    if (!didInitialScroll && scrollEl) {
      const currentWeekKey = toDateKey(getWeekStart(new Date()));
      if (toDateKey(weekStart) === currentWeekKey) {
        requestAnimationFrame(() => {
          const hourHeight = Number.parseFloat(getComputedStyle(calendarEl).getPropertyValue('--calendar-hour-height')) || 72;
          scrollEl.scrollTop = Math.max(0, (now.getHours() - 2) * hourHeight);
        });
      }
      didInitialScroll = true;
    }
  }

  previousButton?.addEventListener('click', () => {
    weekStart = addDays(weekStart, -7);
    render();
  });
  nextButton?.addEventListener('click', () => {
    weekStart = addDays(weekStart, 7);
    render();
  });
  todayButton?.addEventListener('click', () => {
    weekStart = getWeekStart(new Date());
    render();
  });

  render();

  return {
    setEvents(nextEvents) {
      events = nextEvents;
      errorMessage = '';
      render();
    },
    setError(message) {
      errorMessage = message;
      render();
    },
  };
}

function createCalendarEvent(event) {
  const link = document.createElement('a');
  link.className = `calendar-event calendar-event-${calendarSubjectClass(event.subjectId)}`;
  link.href = `/lesson.html?id=${encodeURIComponent(event.id)}`;
  link.setAttribute('aria-label', `${event.time}, ${event.subjectTitle}: ${event.title}`);

  const meta = document.createElement('span');
  meta.className = 'calendar-event-meta';
  meta.textContent = `${event.time} · ${event.subjectIcon} ${event.subjectTitle}`;
  const title = document.createElement('strong');
  title.textContent = event.title;
  link.append(meta, title);
  return link;
}

function calendarSubjectClass(subjectId) {
  const knownSubjects = new Set(['russian', 'math', 'lit', 'world', 'izo', 'training']);
  return knownSubjects.has(subjectId) ? subjectId : 'default';
}

function getWeekStart(value) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function addDays(value, amount) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount, 12);
}

function toDateKey(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatWeekRange(start, end) {
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(start);
  const endMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(end);
  const year = end.getFullYear();

  if (start.getFullYear() !== end.getFullYear()) {
    return `${startDay} ${startMonth} ${start.getFullYear()} — ${endDay} ${endMonth} ${year}`;
  }
  if (start.getMonth() !== end.getMonth()) return `${startDay} ${startMonth} — ${endDay} ${endMonth} ${year}`;
  return `${startDay}–${endDay} ${endMonth} ${year}`;
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(value);
}
