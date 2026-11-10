/** Mirrors the Supabase Auth password policy configured for the Studio project. */
export function passwordProblem(password: string) {
  if (password.length < 10) return "Use pelo menos 10 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
    return "Use letras maiúsculas, minúsculas e números.";
  return null;
}
