/** Является ли лаба «Практическим заданием» (python_code). */
export function isPracticeLab(checkMode) {
  return checkMode === "python_code";
}

/** Полная подпись — для заголовков страниц и редактора. */
export function labTypeLabel(checkMode) {
  return isPracticeLab(checkMode) ? "Практическое задание" : "Лабораторная работа";
}

/** Короткая подпись — для дерева, бейджей, компактных мест. */
export function labTypeShort(checkMode) {
  return isPracticeLab(checkMode) ? "Практика" : "Лаба";
}

/** Цвет-акцент типа. Практика — emerald (ассоциация с кодом),
 *  лабораторная — cyan. Используется для точки-маркера и иконок. */
export function labTypeColor(checkMode) {
  return isPracticeLab(checkMode) ? "#10B981" : "#0891B2";
}
