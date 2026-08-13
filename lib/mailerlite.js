'use strict';

const API_URL = 'https://connect.mailerlite.com/api/subscribers';

function parseGroupIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function getFieldKeys(env = process.env) {
  return {
    studentName: env.MAILERLITE_FIELD_STUDENT_NAME || 'name',
    progressMonth: env.MAILERLITE_FIELD_PROGRESS_MONTH || '',
    lessonsCompleted: env.MAILERLITE_FIELD_LESSONS_COMPLETED || 'lessons_completed',
    tasksAnswered: env.MAILERLITE_FIELD_TASKS_ANSWERED || 'tasks_answered',
    correct: env.MAILERLITE_FIELD_CORRECT || 'correct_count',
    partial: env.MAILERLITE_FIELD_PARTIAL || 'partial_count',
    incorrect: env.MAILERLITE_FIELD_INCORRECT || 'incorrect_count',
    score: env.MAILERLITE_FIELD_SCORE || 'score_period',
  };
}

function buildSubscriberPayload({ email, studentName, stats, groupIds = [], fieldKeys = getFieldKeys(), optIn }) {
  const fields = {};
  const values = {
    studentName,
    progressMonth: stats.month,
    lessonsCompleted: stats.lessonsCompleted,
    tasksAnswered: stats.tasksAnswered,
    correct: stats.correct,
    partial: stats.partial,
    incorrect: stats.incorrect,
    score: stats.score,
  };

  for (const [name, value] of Object.entries(values)) {
    const key = fieldKeys[name];
    if (key) fields[key] = value;
  }

  const payload = {
    email,
    fields,
  };

  if (groupIds.length > 0) payload.groups = groupIds;
  if (optIn?.at) payload.opted_in_at = optIn.at;
  if (optIn?.ip) payload.optin_ip = optIn.ip;
  return payload;
}

function createMailerLiteClient(env = process.env, fetchImpl = globalThis.fetch) {
  // Keep the variable names from the user's first local integration working.
  const token = env.MAILERLITE_API_TOKEN || env.MAILERLITE_API_KEY;
  const groupIds = parseGroupIds(env.MAILERLITE_GROUP_IDS || env.MAILERLITE_GROUP_ID);
  const fieldKeys = getFieldKeys(env);

  return {
    enabled: Boolean(token),
    async syncSubscriber(input) {
      if (!token) return { skipped: true, reason: 'MailerLite API token is not configured' };

      const response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Version': '2026-08-11',
        },
        body: JSON.stringify(buildSubscriberPayload({ ...input, groupIds, fieldKeys })),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`MailerLite ${response.status}: ${body.slice(0, 300)}`);
      }

      return response.json();
    },
  };
}

module.exports = { buildSubscriberPayload, createMailerLiteClient, getFieldKeys, parseGroupIds };
