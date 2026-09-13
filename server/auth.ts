import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthProfile, AuthResponse, AuthUser, ModuleId, UserRole } from '../src/types';
import { query } from './db';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 168);
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-only-change-this-auth-secret';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  profile: AuthProfile;
  password_hash: string;
  password_salt: string;
  active: boolean;
}

const profileModuleAccess: Record<AuthProfile, ModuleId[]> = {
  admin: ['agent', 'technician', 'customer'],
  agent: ['agent'],
  technician: ['technician'],
  customer: ['customer'],
};

const demoUsers: Array<{ id: string; name: string; email: string; role: UserRole; profile: AuthProfile; password: string }> = [
  { id: 'user-admin', name: 'Admin User', email: 'admin@servicedesk.local', role: 'Admin', profile: 'admin', password: 'Admin@12345' },
  { id: 'user-agent', name: 'Agent User', email: 'agent@servicedesk.local', role: 'Agent', profile: 'agent', password: 'Agent@12345' },
  { id: 'user-technician', name: 'Technician User', email: 'tech@servicedesk.local', role: 'Technician', profile: 'technician', password: 'Tech@12345' },
  { id: 'user-customer', name: 'Customer User', email: 'customer@servicedesk.local', role: 'Customer', profile: 'customer', password: 'Customer@12345' },
];

function toAuthUser(row: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'profile'>): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    profile: row.profile,
    moduleAccess: profileModuleAccess[row.profile],
  };
}

async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: derived.toString('hex') };
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = await hashPassword(password, salt);
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string) {
  return createHash('sha256').update(`${AUTH_SECRET}:${token}`).digest('hex');
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function seedAuthUsersIfEmpty() {
  for (const user of demoUsers) {
    const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [user.email]);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const { salt, hash } = await hashPassword(user.password);
    await query(
      `INSERT INTO users (id, name, email, role, profile, password_hash, password_salt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.name, user.email, user.role, user.profile, hash, salt],
    );
  }
}

export async function loginWithPassword(emailInput: string, password: string): Promise<AuthResponse> {
  const email = emailInput.trim().toLowerCase();
  if (!validateEmail(email) || password.length < 8) {
    throw new Error('Invalid email or password.');
  }

  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1 AND active = TRUE', [email]);
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    throw new Error('Invalid email or password.');
  }

  const token = randomBytes(32).toString('hex');
  const sessionId = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
  await query('INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [
    sessionId,
    row.id,
    hashToken(token),
    expiresAt,
  ]);

  return { token, user: toAuthUser(row) };
}

export async function getUserForToken(token: string): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const result = await query<UserRow>(
    `SELECT users.*
     FROM user_sessions
     JOIN users ON users.id = user_sessions.user_id
     WHERE user_sessions.token_hash = $1
       AND user_sessions.expires_at > NOW()
       AND users.active = TRUE`,
    [hashToken(token)],
  );

  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

export async function logoutToken(token: string) {
  await query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export function canAccessModule(user: AuthUser, moduleId: ModuleId) {
  return user.moduleAccess.includes(moduleId);
}

export const demoLoginHints = demoUsers.map(({ email, password, role }) => ({ email, password, role }));
