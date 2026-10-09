import * as argon2 from 'argon2';
import { BusinessRuleError } from '../common/errors/app-exceptions';

// A short deny-list of the most common passwords; length >= 8 is enforced by the DTO.
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123', 'qwerty123',
  'qwertyuiop', 'iloveyou', 'abc12345', '11111111', '00000000', 'admin123', 'welcome1',
  'cambodia', 'phnompenh', 'chlatvei',
]);

export function assertAcceptablePassword(password: string): void {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new BusinessRuleError('This password is too common. Please choose another.');
  }
}

/** argon2id with library defaults (memory-hard; OWASP-recommended). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}
