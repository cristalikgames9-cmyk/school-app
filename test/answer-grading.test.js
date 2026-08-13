'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeAnswer, toPublicTask, validateSelectedOptions } = require('../lib/answer-grading');

test('grades single-choice answers on the server', () => {
  const task = {
    type: 'normal',
    options: [{ id: 'A' }, { id: 'B' }],
    correctAnswer: 'B',
  };
  assert.equal(gradeAnswer(task, ['B']), 'correct');
  assert.equal(gradeAnswer(task, ['A']), 'incorrect');
});

test('grades exact, partial and incorrect multiple-choice answers', () => {
  const task = {
    type: 'multiple',
    options: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    correctAnswer: ['A', 'C'],
  };
  assert.equal(gradeAnswer(task, ['C', 'A']), 'correct');
  assert.equal(gradeAnswer(task, ['A']), 'partial');
  assert.equal(gradeAnswer(task, ['A', 'B']), 'partial');
  assert.equal(gradeAnswer(task, ['B']), 'incorrect');
});

test('normalizes case, unicode and whitespace in text answers', () => {
  const task = { type: 'text', correctAnswer: ['Два', '2'] };
  assert.equal(gradeAnswer(task, ['  ДВА  ']), 'correct');
  assert.equal(gradeAnswer(task, ['три']), 'incorrect');
});

test('rejects forged option ids and strips correct answers from public tasks', () => {
  const task = {
    id: 't1',
    type: 'normal',
    options: [{ id: 'A' }, { id: 'B' }],
    correctAnswer: 'A',
  };
  assert.equal(validateSelectedOptions(task, ['ADMIN_CORRECT']), false);
  assert.deepEqual(toPublicTask(task), {
    id: 't1',
    type: 'normal',
    options: [{ id: 'A' }, { id: 'B' }],
  });
});
