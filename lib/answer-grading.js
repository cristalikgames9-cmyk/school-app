'use strict';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru');
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function getCorrectOptions(task) {
  if (!task || task.type === 'text') return [];
  return asArray(task.correctAnswer).map(String);
}

function validateSelectedOptions(task, selectedOptions) {
  if (!task || !Array.isArray(selectedOptions)) return false;

  if (task.type === 'text') {
    return selectedOptions.length === 1 && normalizeText(selectedOptions[0]).length > 0 && String(selectedOptions[0]).length <= 500;
  }

  const allowed = new Set((task.options || []).map((option) => String(option.id)));
  const selected = selectedOptions.map(String);
  if (selected.length === 0 || selected.length > allowed.size) return false;
  if (new Set(selected).size !== selected.length) return false;
  if (!selected.every((id) => allowed.has(id))) return false;
  return task.type === 'multiple' || selected.length === 1;
}

function gradeAnswer(task, selectedOptions) {
  if (!validateSelectedOptions(task, selectedOptions)) {
    throw new Error('INVALID_ANSWER');
  }

  if (task.type === 'text') {
    const accepted = asArray(task.correctAnswer).map(normalizeText);
    return accepted.includes(normalizeText(selectedOptions[0])) ? 'correct' : 'incorrect';
  }

  const selected = new Set(selectedOptions.map(String));
  const correct = new Set(getCorrectOptions(task));
  const exact = selected.size === correct.size && [...selected].every((id) => correct.has(id));
  if (exact) return 'correct';

  if (task.type === 'multiple' && [...selected].some((id) => correct.has(id))) {
    return 'partial';
  }

  return 'incorrect';
}

function toPublicTask(task) {
  const { correctAnswer, ...publicTask } = task;
  return publicTask;
}

module.exports = {
  getCorrectOptions,
  gradeAnswer,
  normalizeText,
  toPublicTask,
  validateSelectedOptions,
};
