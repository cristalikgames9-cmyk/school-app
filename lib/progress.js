'use strict';

const STATUS_WEIGHTS = Object.freeze({
  correct: 1,
  partial: 0.5,
  incorrect: 0,
});

function getMonthKey(value, timeZone = 'America/Costa_Rica') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
}

function calculateProgress({ answers = [], lessons = [], now = new Date(), timeZone = 'America/Costa_Rica' }) {
  const month = getMonthKey(now, timeZone);
  const validStatuses = new Set(Object.keys(STATUS_WEIGHTS));
  const lessonMap = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));
  const taskIdsByLesson = new Map(
    lessons.map((lesson) => [
      String(lesson.id),
      new Set((Array.isArray(lesson.tasks) ? lesson.tasks : []).map((task) => String(task.id))),
    ])
  );
  const answersByLesson = new Map();

  for (const answer of answers) {
    const lessonId = String(answer.lesson_id || '');
    const questionId = String(answer.question_id || '');
    if (!lessonMap.has(lessonId) || !questionId || !taskIdsByLesson.get(lessonId)?.has(questionId)) continue;

    if (!answersByLesson.has(lessonId)) answersByLesson.set(lessonId, new Map());
    const byQuestion = answersByLesson.get(lessonId);
    const previous = byQuestion.get(questionId);
    if (!previous || new Date(answer.created_at) < new Date(previous.created_at)) {
      byQuestion.set(questionId, answer);
    }
  }

  const uniqueAnswers = [...answersByLesson.values()].flatMap((byQuestion) => [...byQuestion.values()]);
  const monthlyAnswers = uniqueAnswers.filter(
    (answer) => validStatuses.has(answer.status) && getMonthKey(answer.created_at, timeZone) === month
  );
  const counts = { correct: 0, partial: 0, incorrect: 0 };
  for (const answer of monthlyAnswers) counts[answer.status] += 1;

  const completedLessonIds = [];
  let monthlyCompletedLessons = 0;

  for (const lesson of lessons) {
    const tasks = Array.isArray(lesson.tasks) ? lesson.tasks : [];
    if (tasks.length === 0) continue;

    const byQuestion = answersByLesson.get(String(lesson.id));
    const taskAnswers = tasks.map((task) => byQuestion?.get(String(task.id))).filter(Boolean);
    if (taskAnswers.length !== tasks.length) continue;

    completedLessonIds.push(String(lesson.id));
    const completedAt = taskAnswers.reduce((latest, answer) => {
      const date = new Date(answer.created_at);
      return !latest || date > latest ? date : latest;
    }, null);
    if (getMonthKey(completedAt, timeZone) === month) monthlyCompletedLessons += 1;
  }

  const tasksAnswered = monthlyAnswers.length;
  const earned = counts.correct * STATUS_WEIGHTS.correct + counts.partial * STATUS_WEIGHTS.partial;
  const score = tasksAnswered > 0 ? Math.round((earned / tasksAnswered) * 100) : 0;

  return {
    timeZone,
    month,
    completedLessonIds,
    completedLessons: completedLessonIds.length,
    monthly: {
      month,
      lessonsCompleted: monthlyCompletedLessons,
      tasksAnswered,
      correct: counts.correct,
      partial: counts.partial,
      incorrect: counts.incorrect,
      score,
    },
  };
}

module.exports = { STATUS_WEIGHTS, calculateProgress, getMonthKey };
