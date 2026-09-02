'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCalendarLessons, parseScheduledAt } = require('../lib/lesson-schedule');

test('parses the documented lesson schedule format', () => {
  assert.deepEqual(parseScheduledAt('2026-09-02T09:30'), {
    date: '2026-09-02',
    time: '09:30',
    hour: 9,
    minute: 30,
  });
});

test('rejects ambiguous, impossible and out-of-range schedule values', () => {
  assert.equal(parseScheduledAt('02.09.26 09:00'), null);
  assert.equal(parseScheduledAt('2026-02-29T09:00'), null);
  assert.equal(parseScheduledAt('2026-09-02T24:00'), null);
});

test('creates a sorted public calendar without lesson tasks or content', () => {
  const lessons = [
    {
      id: 'math-2',
      subjectId: 'math',
      title: 'Урок 2',
      scheduledAt: '2026-09-03T10:00',
      content: 'Скрытый текст',
      tasks: [{ correctAnswer: 'A' }],
    },
    {
      id: 'math-1',
      subjectId: 'math',
      title: 'Урок 1',
      scheduledAt: '2026-09-02T09:00',
    },
    { id: 'draft', subjectId: 'math', title: 'Без даты' },
  ];

  assert.deepEqual(buildCalendarLessons(lessons, [{ id: 'math', title: 'Математика', icon: '📐' }]), [
    {
      id: 'math-1',
      subjectId: 'math',
      subjectTitle: 'Математика',
      subjectIcon: '📐',
      title: 'Урок 1',
      scheduledAt: '2026-09-02T09:00',
      date: '2026-09-02',
      time: '09:00',
      hour: 9,
      minute: 0,
    },
    {
      id: 'math-2',
      subjectId: 'math',
      subjectTitle: 'Математика',
      subjectIcon: '📐',
      title: 'Урок 2',
      scheduledAt: '2026-09-03T10:00',
      date: '2026-09-03',
      time: '10:00',
      hour: 10,
      minute: 0,
    },
  ]);
});
