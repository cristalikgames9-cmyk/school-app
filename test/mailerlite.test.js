'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSubscriberPayload, createMailerLiteClient, getFieldKeys, parseGroupIds } = require('../lib/mailerlite');

test('builds a MailerLite subscriber payload with monthly custom fields', () => {
  const payload = buildSubscriberPayload({
    email: 'parent@example.com',
    studentName: 'Дамир',
    groupIds: ['123'],
    fieldKeys: {
      studentName: 'name',
      progressMonth: 'month',
      lessonsCompleted: 'lessons',
      tasksAnswered: 'tasks',
      correct: 'correct',
      partial: 'partial',
      incorrect: 'incorrect',
      score: 'score',
    },
    stats: {
      month: '2026-08',
      lessonsCompleted: 3,
      tasksAnswered: 10,
      correct: 7,
      partial: 2,
      incorrect: 1,
      score: 80,
    },
  });

  assert.deepEqual(payload, {
    email: 'parent@example.com',
    fields: {
      name: 'Дамир',
      month: '2026-08',
      lessons: 3,
      tasks: 10,
      correct: 7,
      partial: 2,
      incorrect: 1,
      score: 80,
    },
    groups: ['123'],
  });
  assert.deepEqual(parseGroupIds(' 1,2, ,3 '), ['1', '2', '3']);
});

test('uses the MailerLite field keys configured in the account screenshots', () => {
  assert.deepEqual(getFieldKeys({}), {
    studentName: 'name',
    progressMonth: '',
    lessonsCompleted: 'lessons_completed',
    tasksAnswered: 'tasks_answered',
    correct: 'correct_count',
    partial: 'partial_count',
    incorrect: 'incorrect_count',
    score: 'score_period',
  });
});

test('accepts legacy API key and single group environment variables', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: { id: 'subscriber-1' } }) };
  };
  const client = createMailerLiteClient(
    { MAILERLITE_API_KEY: 'legacy-token', MAILERLITE_GROUP_ID: 'parents-group' },
    fetchImpl
  );

  await client.syncSubscriber({
    email: 'parent@example.com',
    studentName: 'Дамир',
    stats: {
      month: '2026-08',
      lessonsCompleted: 1,
      tasksAnswered: 2,
      correct: 1,
      partial: 1,
      incorrect: 0,
      score: 75,
    },
  });

  assert.equal(client.enabled, true);
  assert.equal(request.options.headers.Authorization, 'Bearer legacy-token');
  assert.deepEqual(JSON.parse(request.options.body).groups, ['parents-group']);
  assert.equal(JSON.parse(request.options.body).fields.score_period, 75);
  assert.equal(Object.hasOwn(JSON.parse(request.options.body).fields, 'undefined'), false);
});
