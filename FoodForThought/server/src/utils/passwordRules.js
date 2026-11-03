// Password rules for new passwords (register + change password).
// The same list is in src/utils/passwordRules.js for the live checklist on the forms;
// it's checked again here so the rules can't be skipped by calling the API directly.

const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'An uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'A lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'A number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'A special character (e.g. ! @ # $ %)', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
]

// bcrypt only uses the first 72 bytes, so anything longer would be silently cut off
const MAX_BYTES = 72

// Returns null if the password is OK, otherwise a message saying what's missing.
function passwordError(password) {
  if (typeof password !== 'string' || !password) return 'Please enter a password.'
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) return 'Password must be at most 72 characters long.'
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password))
    .map((rule) => rule.label.charAt(0).toLowerCase() + rule.label.slice(1)) // 'An uppercase letter (A-Z)' -> 'an uppercase letter (A-Z)'
  if (missing.length === 0) return null
  return `Password needs: ${missing.join(', ')}.`
}

module.exports = { PASSWORD_RULES, passwordError }
