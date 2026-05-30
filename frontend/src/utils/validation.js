export const PASSWORD_MIN_LEN = 8;

/** Короткая подсказка под input — placeholder / hint текст. */
export const PASSWORD_HINT = "8+ символов, буква и цифра";

export function validatePassword(plain) {
  if (!plain || plain.length < PASSWORD_MIN_LEN) {
    return `Пароль минимум ${PASSWORD_MIN_LEN} символов`;
  }
  const hasLetter = /[a-zA-Zа-яА-ЯёЁ]/.test(plain);
  const hasDigit = /\d/.test(plain);
  if (!hasLetter) return "Пароль должен содержать хотя бы одну букву";
  if (!hasDigit) return "Пароль должен содержать хотя бы одну цифру";
  return null;
}
