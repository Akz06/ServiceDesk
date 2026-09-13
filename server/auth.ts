import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthProfile, AuthResponse, AuthUser, ManagedUser, ModuleId, UserDraft, UserRole } from '../src/types';
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
  created_at: string;
}

const profileModuleAccess: Record<AuthProfile, ModuleId[]> = {
  admin: ['admin', 'agent', 'technician', 'customer'],
  agent: ['agent'],
  technician: ['technician'],
  customer: ['customer'],
};

const roleForProfile: Record<AuthProfile, UserRole> = {
  admin: 'Admin',
  agent: 'Agent',
  technician: 'Technician',
  customer: 'Customer',
};

const validProfiles = new Set<AuthProfile>(['admin', 'agent', 'technician', 'customer']);

const demoUsers: Array<{ id: string; name: string; email: string; role: UserRole; profile: AuthProfile; password: string }> = [
  { id: 'user-admin', name: 'Admin User', email: 'admin@servicedesk.local', role: 'Admin', profile: 'admin', password: 'Admin@12345' },
  { id: 'user-agent', name: 'Agent User', email: 'agent@servicedesk.local', role: 'Agent', profile: 'agent', password: 'Agent@12345' },
  { id: 'user-technician', name: 'Technician User', email: 'tech@servicedesk.local', role: 'Technician', profile: 'technician', password: 'Tech@12345' },
  { id: 'user-customer', name: 'Customer User', email: 'customer@servicedesk.local', role: 'Customer', profile: 'customer', password: 'Customer@12345' },
];

class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

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

function toManagedUser(row: UserRow): ManagedUser {
  return {
    ...toAuthUser(row),
    active: row.active,
    createdAt: new Date(row.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
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

function normalizeProfile(profile: string): AuthProfile {
  const normalized = profile.toLowerCase() as AuthProfile;
  if (!validProfiles.has(normalized)) {
    throw new AuthError('Invalid user profile.');
  }

  return normalized;
}

function validateUserDraft(draft: UserDraft, requirePassword: boolean) {
  const name = draft.name.trim();
  const email = draft.email.trim().toLowerCase();
  const profile = normalizeProfile(draft.profile);
  const password = draft.password;

  if (name.length < 2) {
    throw new AuthError('User name must be at least 2 characters.');
  }

  if (!validateEmail(email)) {
    throw new AuthError('A valid email is required.');
  }

  if ((requirePassword || password.length > 0) && password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.');
  }

  return { name, email, profile, password, active: Boolean(draft.active) };
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
    throw new AuthError('Invalid email or password.', 401);
  }

  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1 AND active = TRUE', [email]);
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    throw new AuthError('Invalid email or password.', 401);
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

export async function listUsers(): Promise<ManagedUser[]> {
  const result = await query<UserRow>('SELECT * FROM users ORDER BY created_at DESC, name ASC');
  return result.rows.map(toManagedUser);
}

export async function createUser(draft: UserDraft): Promise<ManagedUser[]> {
  const next = validateUserDraft(draft, true);
  const duplicate = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [next.email]);
  if (duplicate.rowCount && duplicate.rowCount > 0) {
    throw new AuthError('A user with this email already exists.', 409);
  }

  const { salt, hash } = await hashPassword(next.password);
  await query(
    `INSERT INTO users (id, name, email, role, profile, password_hash, password_salt, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [`user-${randomBytes(8).toString('hex')}`, next.name, next.email, roleForProfile[next.profile], next.profile, hash, salt, next.active],
  );

  return listUsers();
}

export async function updateUser(id: string, draft: UserDraft, actorUserId: string): Promise<ManagedUser[]> {
  const next = validateUserDraft(draft, false);
  const existing = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing.rows[0]) {
    throw new AuthError('User not found.', 404);
  }

  if (id === actorUserId && !next.active) {
    throw new AuthError('You cannot deactivate your own admin account.', 400);
  }

  const duplicate = await query<{ id: string }>('SELECT id FROM users WHERE email = $1 AND id <> $2', [next.email, id]);
  if (duplicate.rowCount && duplicate.rowCount > 0) {
    throw new AuthError('A user with this email already exists.', 409);
  }

  if (next.password.length > 0) {
    const { salt, hash } = await hashPassword(next.password);
    await query(
      `UPDATE users SET name = $2, email = $3, role = $4, profile = $5, active = $6, password_hash = $7, password_salt = $8 WHERE id = $1`,
      [id, next.name, next.email, roleForProfile[next.profile], next.profile, next.active, hash, salt],
    );
  } else {
    await query('UPDATE users SET name = $2, email = $3, role = $4, profile = $5, active = $6 WHERE id = $1', [
      id,
      next.name,
      next.email,
      roleForProfile[next.profile],
      next.profile,
      next.active,
    ]);
  }

  if (!next.active) {
    await query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
  }

  return listUsers();
}

export const demoLoginHints = demoUsers.map(({ email, password, role }) => ({ email, password, role }));
