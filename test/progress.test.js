'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProgress, getMonthKey } = require('../lib/progress');

const lessons = [
  { id: 'math-1', tasks: [{ id: 'q1' }, { id: 'q2' }] },
  { id: 'lit-1', tasks: [{ id: 'q1' }] },
];

test('uses a calendar month in the configured time zone', () => {
  assert.equal(getMonthKey('2026-08-01T05:30:00.000Z', 'America/Costa_Rica'), '2026-07');
  assert.equal(getMonthKey('2026-08-01T06:00:00.000Z', 'America/Costa_Rica'), '2026-08');
});

test('calculates monthly counts and a 100-point score', () => {
  const progress = calculateProgress({
    lessons,
    now: new Date('2026-08-20T12:00:00.000Z'),
    timeZone: 'America/Costa_Rica',
    answers: [
      { lesson_id: 'math-1', question_id: 'q1', status: 'correct', created_at: '2026-08-03T12:00:00.000Z' },
      { lesson_id: 'math-1', question_id: 'q2', status: 'partial', created_at: '2026-08-04T12:00:00.000Z' },
      { lesson_id: 'lit-1', question_id: 'q1', status: 'incorrect', created_at: '2026-08-05T12:00:00.000Z' },
    ],
  });

  assert.deepEqual(progress.monthly, {
    month: '2026-08',
    lessonsCompleted: 2,
    tasksAnswered: 3,
    correct: 1,
    partial: 1,
    incorrect: 1,
    score: 50,
  });
  assert.deepEqual(progress.completedLessonIds.sort(), ['lit-1', 'math-1']);
});

test('counts a lesson in the month when its final task is completed', () => {
  const progress = calculateProgress({
    lessons: [lessons[0]],
    now: new Date('2026-08-20T12:00:00.000Z'),
    timeZone: 'America/Costa_Rica',
    answers: [
      { lesson_id: 'math-1', question_id: 'q1', status: 'correct', created_at: '2026-07-30T12:00:00.000Z' },
      { lesson_id: 'math-1', question_id: 'q2', status: 'correct', created_at: '2026-08-02T12:00:00.000Z' },
    ],
  });

  assert.equal(progress.monthly.lessonsCompleted, 1);
  assert.equal(progress.monthly.tasksAnswered, 1);
  assert.equal(progress.monthly.score, 100);
});

test('ignores removed questions and duplicate legacy rows', () => {
  const progress = calculateProgress({
    lessons: [{ id: 'math-1', tasks: [{ id: 'q1' }] }],
    now: new Date('2026-08-20T12:00:00.000Z'),
    timeZone: 'America/Costa_Rica',
    answers: [
      { lesson_id: 'math-1', question_id: 'q1', status: 'correct', created_at: '2026-08-02T12:00:00.000Z' },
      { lesson_id: 'math-1', question_id: 'q1', status: 'incorrect', created_at: '2026-08-03T12:00:00.000Z' },
      { lesson_id: 'math-1', question_id: 'removed', status: 'incorrect', created_at: '2026-08-04T12:00:00.000Z' },
    ],
  });

  assert.equal(progress.monthly.tasksAnswered, 1);
  assert.equal(progress.monthly.correct, 1);
  assert.equal(progress.monthly.score, 100);
});
