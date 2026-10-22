const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const namePattern = /^\p{L}+(?:[ '’-]\p{L}+)*$/u; // Anne-Marie, O'Brien

function makeSchema(validate) {
  return {
    safeParse(values) {
      const issues = validate(values);
      return issues.length
        ? { success: false, error: { issues } }
        : { success: true, data: values };
    },
  };
}

function validateEmail(email) {
  const value = String(email || '').trim();
  if (!value) return 'Enter your email address.';
  if (value.length > 254 || !emailPattern.test(value)) return 'Enter a valid email address.';
  return '';
}

function validatePassword(password) {
  if (!password) return 'Enter your password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return '';
}

export const loginSchema = makeSchema(({ email, password }) => [
  validateEmail(email),
  validatePassword(password),
].filter(Boolean));

export const registrationSchema = makeSchema(({ name, email, password, confirmPassword }) => {
  const errors = [];
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleanName) errors.push('Enter your full name.');
  else if (cleanName.length > 80 || !namePattern.test(cleanName)) errors.push('Name can contain letters, spaces, hyphens and apostrophes only (up to 80 characters).');

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (emailError) errors.push(emailError);
  if (passwordError) errors.push(passwordError);
  if (password && confirmPassword !== password) errors.push('Passwords do not match.');
  return errors;
});
