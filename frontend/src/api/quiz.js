import { apiGet, apiPost, apiPut, apiDelete } from "./http";

/** Получить вопросы к главе (без правильных ответов) */
export async function fetchQuestionsForChapter(chapterId) {
  const res = await apiGet(`/quiz/chapter/${chapterId}`, { auth: false });
  return res.ok ? res.data : [];
}

/** { chapter_id: count } — общее число вопросов по каждой опубликованной главе.
 *  Используется на главной/прогрессе для расчёта total. */
export async function fetchQuestionCounts() {
  const res = await apiGet("/quiz/counts", { auth: false });
  return res.ok ? res.data || {} : {};
}

/** Получить сохранённые ответы текущего пользователя по главе */
export async function fetchMyAnswers(chapterId) {
  const res = await apiGet(`/quiz/chapter/${chapterId}/my-answers`);
  return res.ok ? res.data : [];
}

/** Проверить ответ на один вопрос (сохраняет результат в БД) */
export async function checkSingleQuestion(questionId, selectedOptionIds) {
  const res = await apiPost(`/quiz/question/${questionId}/check`, {
    selected_option_ids: selectedOptionIds,
  });
  return res.ok ? res.data : null;
}

// ── Admin ──

export async function fetchAllAdminQuestions() {
  const res = await apiGet("/quiz/admin/all");
  return res.ok ? res.data : [];
}

export async function fetchAdminQuestions(chapterId) {
  const res = await apiGet(`/quiz/admin/chapter/${chapterId}`);
  return res.ok ? res.data : [];
}

export async function createQuestion(chapterId, body) {
  const res = await apiPost(`/quiz/admin/chapter/${chapterId}/questions`, body);
  return res.ok ? res.data : null;
}

export async function updateQuestion(questionId, body) {
  const res = await apiPut(`/quiz/admin/questions/${questionId}`, body);
  return res.ok ? res.data : null;
}

export async function deleteQuestion(questionId) {
  const res = await apiDelete(`/quiz/admin/questions/${questionId}`);
  return res.ok;
}

export async function addOption(questionId, body) {
  const res = await apiPost(`/quiz/admin/questions/${questionId}/options`, body);
  return res.ok ? res.data : null;
}

export async function updateOption(optionId, body) {
  const res = await apiPut(`/quiz/admin/options/${optionId}`, body);
  return res.ok ? res.data : null;
}

export async function deleteOption(optionId) {
  const res = await apiDelete(`/quiz/admin/options/${optionId}`);
  return res.ok;
}
