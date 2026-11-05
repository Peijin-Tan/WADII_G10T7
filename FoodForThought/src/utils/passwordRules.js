export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'An uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'A lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'A number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'A special character (e.g. ! @ # $ %)', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
]

export const MAX_PASSWORD_LENGTH = 72

export function checkPassword(password = '') {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(password) }))
}

export function isStrongPassword(password = '') {
  return new TextEncoder().encode(password).length <= MAX_PASSWORD_LENGTH && PASSWORD_RULES.every((rule) => rule.test(password))
}
