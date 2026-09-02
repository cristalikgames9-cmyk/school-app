'use strict';

const SCHEDULE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

function parseScheduledAt(value) {
  if (typeof value !== 'string') return null;

  const match = value.match(SCHEDULE_PATTERN);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    date: `${yearText}-${monthText}-${dayText}`,
    time: `${hourText}:${minuteText}`,
    hour: Number(hourText),
    minute: Number(minuteText),
  };
}

function buildCalendarLessons(lessons, subjects) {
  const subjectById = new Map((subjects || []).map((subject) => [String(subject.id), subject]));

  return (lessons || [])
    .map((lesson) => {
      const schedule = parseScheduledAt(lesson.scheduledAt);
      if (!schedule) return null;

      const subject = subjectById.get(String(lesson.subjectId)) || {};
      return {
        id: String(lesson.id),
        subjectId: String(lesson.subjectId || ''),
        subjectTitle: subject.title || subject.name || String(lesson.subjectId || ''),
        subjectIcon: subject.icon || '📘',
        title: String(lesson.title || 'Урок'),
        scheduledAt: `${schedule.date}T${schedule.time}`,
        date: schedule.date,
        time: schedule.time,
        hour: schedule.hour,
        minute: schedule.minute,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.title.localeCompare(b.title, 'ru'));
}

module.exports = { buildCalendarLessons, parseScheduledAt };
