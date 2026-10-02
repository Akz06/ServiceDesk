import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type {
  AuthProfile,
  AuthResponse,
  AuthUser,
  BulkUserCreationResult,
  BulkUserRow,
  ManagedUser,
  ModuleId,
  OrganizationSettingsPatch,
  OrganizationSignupDraft,
  PlatformEvent,
  PlatformOrganizationSummary,
  PlatformUserSummary,
  UserDraft,
  UserRole,
} from '../src/types';
import { query, withTransaction } from './db';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 168);
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-only-change-this-auth-secret';

interface UserRow {
  id: string;
  organization_id: string;
  organization_name: string;
  work_item_id_prefix: string;
  invoice_id_prefix: string;
  currency_code: string;
  name: string;
  email: string;
  role: UserRole;
  profile: AuthProfile;
  password_hash: string;
  password_salt: string;
  active: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  is_platform_admin: boolean;
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

function toAuthUser(
  row: Pick<
    UserRow,
    'id' | 'name' | 'email' | 'role' | 'profile' | 'organization_id' | 'organization_name' | 'work_item_id_prefix' | 'invoice_id_prefix' | 'currency_code'
  > &
    Partial<Pick<UserRow, 'is_platform_admin'>>,
): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    profile: row.profile,
    moduleAccess: profileModuleAccess[row.profile],
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    workItemIdPrefix: row.work_item_id_prefix,
    invoiceIdPrefix: row.invoice_id_prefix,
    currencyCode: row.currency_code,
    isPlatformAdmin: Boolean(row.is_platform_admin),
  };
}

export function slugify(value: string): string {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return base || 'org';
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}

// Best-effort operational log for the platform admin console — never lets a logging
// failure break the request it's describing.
export async function logPlatformEvent(eventType: string, details: {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetUserId?: string | null;
  message: string;
}) {
  try {
    await query(
      `INSERT INTO platform_events (id, event_type, organization_id, actor_user_id, actor_email, target_user_id, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `evt-${randomBytes(8).toString('hex')}`,
        eventType,
        details.organizationId ?? null,
        details.actorUserId ?? null,
        details.actorEmail ?? null,
        details.targetUserId ?? null,
        details.message,
      ],
    );
  } catch (error) {
    console.error('Failed to record platform event', error);
  }
}

const formatStamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function toManagedUser(row: UserRow): ManagedUser {
  return {
    ...toAuthUser(row),
    active: row.active,
    createdAt: formatStamp(row.created_at),
    createdBy: row.created_by,
    updatedAt: formatStamp(row.updated_at),
    updatedBy: row.updated_by,
  };
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
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

export function normalizeProfile(profile: string): AuthProfile {
  const normalized = profile.toLowerCase() as AuthProfile;
  if (!validProfiles.has(normalized)) {
    throw new AuthError('Invalid user profile.');
  }

  return normalized;
}

export function validateUserDraft(draft: UserDraft, requirePassword: boolean) {
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
      `INSERT INTO users (id, organization_id, name, email, role, profile, password_hash, password_salt)
       VALUES ($1, 'org-default', $2, $3, $4, $5, $6, $7)`,
      [user.id, user.name, user.email, user.role, user.profile, hash, salt],
    );
  }
}

// Grants platform-admin (the /admin console) access to one account by email, driven by the
// PLATFORM_ADMIN_EMAIL env var. Safe to run on every boot — it's just an idempotent UPDATE — so
// no separate one-off script or direct database write is needed to turn this on.
export async function grantPlatformAdminFromEnv() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    return;
  }

  const result = await query<{ id: string }>('UPDATE users SET is_platform_admin = TRUE WHERE email = $1 RETURNING id', [email]);
  if (result.rowCount && result.rowCount > 0) {
    console.log(`Granted platform admin access to ${email}.`);
  } else {
    console.warn(`PLATFORM_ADMIN_EMAIL is set to "${email}", but no user with that email exists yet.`);
  }
}

async function issueSession(userId: string): Promise<{ token: string }> {
  const token = randomBytes(32).toString('hex');
  const sessionId = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
  await query('INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [
    sessionId,
    userId,
    hashToken(token),
    expiresAt,
  ]);

  return { token };
}

export async function loginWithPassword(emailInput: string, password: string): Promise<AuthResponse> {
  const email = emailInput.trim().toLowerCase();
  if (!validateEmail(email) || password.length < 8) {
    throw new AuthError('Invalid email or password.', 401);
  }

  const result = await query<UserRow>(
    `SELECT users.*, organizations.name AS organization_name,
     organizations.work_item_id_prefix, organizations.invoice_id_prefix, organizations.currency_code
     FROM users
     JOIN organizations ON organizations.id = users.organization_id
     WHERE users.email = $1 AND users.active = TRUE`,
    [email],
  );
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    await logPlatformEvent('login_failed', { actorEmail: email, message: `Failed login attempt for ${email}.` });
    throw new AuthError('Invalid email or password.', 401);
  }

  const { token } = await issueSession(row.id);
  await logPlatformEvent('login_succeeded', {
    organizationId: row.organization_id,
    actorUserId: row.id,
    actorEmail: row.email,
    message: `${row.email} logged in.`,
  });
  return { token, user: toAuthUser(row) };
}

export async function getUserForToken(token: string): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const result = await query<UserRow>(
    `SELECT users.*, organizations.name AS organization_name,
     organizations.work_item_id_prefix, organizations.invoice_id_prefix, organizations.currency_code
     FROM user_sessions
     JOIN users ON users.id = user_sessions.user_id
     JOIN organizations ON organizations.id = users.organization_id
     WHERE user_sessions.token_hash = $1
       AND user_sessions.expires_at > NOW()
       AND users.active = TRUE`,
    [hashToken(token)],
  );

  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

export async function createOrganizationWithAdmin(input: OrganizationSignupDraft): Promise<AuthResponse> {
  const organizationName = input.organizationName.trim();
  if (organizationName.length < 2) {
    throw new AuthError('Organization name must be at least 2 characters.');
  }

  const next = validateUserDraft(
    { name: input.adminName, email: input.adminEmail, password: input.adminPassword, profile: 'admin', active: true },
    true,
  );

  const duplicate = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [next.email]);
  if (duplicate.rowCount && duplicate.rowCount > 0) {
    throw new AuthError('A user with this email already exists.', 409);
  }

  const { salt, hash } = await hashPassword(next.password);
  const organizationId = `org-${randomBytes(8).toString('hex')}`;
  const userId = `user-${randomBytes(8).toString('hex')}`;
  const baseSlug = slugify(organizationName);

  const row = await withTransaction(async (client) => {
    let inserted = false;
    for (let attempt = 0; attempt < 20 && !inserted; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      // Postgres aborts the whole transaction on a failed statement, so a caught unique-violation
      // would otherwise poison every later query in this transaction — a SAVEPOINT per attempt
      // keeps the transaction usable so the next slug can actually be tried.
      await client.query('SAVEPOINT slug_attempt');
      try {
        await client.query('INSERT INTO organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4)', [
          organizationId,
          organizationName,
          slug,
          next.name,
        ]);
        await client.query('RELEASE SAVEPOINT slug_attempt');
        inserted = true;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT slug_attempt');
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    if (!inserted) {
      throw new AuthError('Unable to generate a unique organization identifier. Try a different organization name.');
    }

    await client.query(
      `INSERT INTO users (id, organization_id, name, email, role, profile, password_hash, password_salt, active, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9)`,
      [userId, organizationId, next.name, next.email, roleForProfile.admin, 'admin', hash, salt, next.name],
    );

    const result = await client.query<UserRow>(
      `SELECT users.*, organizations.name AS organization_name,
     organizations.work_item_id_prefix, organizations.invoice_id_prefix, organizations.currency_code
       FROM users
       JOIN organizations ON organizations.id = users.organization_id
       WHERE users.id = $1`,
      [userId],
    );
    return result.rows[0];
  });

  const { token } = await issueSession(row.id);
  await logPlatformEvent('organization_created', {
    organizationId: row.organization_id,
    actorUserId: row.id,
    actorEmail: row.email,
    message: `Organization "${row.organization_name}" created by ${row.email}.`,
  });
  return { token, user: toAuthUser(row) };
}

export async function listOrganizationsForPlatform(): Promise<PlatformOrganizationSummary[]> {
  const result = await query<{
    id: string;
    name: string;
    slug: string;
    created_at: string;
    user_count: string;
    customer_count: string;
    work_item_count: string;
    invoice_count: string;
  }>(
    `SELECT
       organizations.id,
       organizations.name,
       organizations.slug,
       organizations.created_at,
       (SELECT COUNT(*) FROM users WHERE users.organization_id = organizations.id)::text AS user_count,
       (SELECT COUNT(*) FROM customers WHERE customers.organization_id = organizations.id)::text AS customer_count,
       (SELECT COUNT(*) FROM work_items WHERE work_items.organization_id = organizations.id)::text AS work_item_count,
       (SELECT COUNT(*) FROM invoices WHERE invoices.organization_id = organizations.id)::text AS invoice_count
     FROM organizations
     ORDER BY organizations.created_at DESC`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: formatStamp(row.created_at),
    userCount: Number(row.user_count),
    customerCount: Number(row.customer_count),
    workItemCount: Number(row.work_item_count),
    invoiceCount: Number(row.invoice_count),
  }));
}

export async function listOrganizationUsersForPlatform(organizationId: string): Promise<PlatformUserSummary[]> {
  const result = await query<Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'profile' | 'active'>>(
    'SELECT id, name, email, role, profile, active FROM users WHERE organization_id = $1 ORDER BY name',
    [organizationId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    profile: row.profile,
    active: row.active,
  }));
}

export async function impersonateUser(actor: AuthUser, targetUserId: string): Promise<AuthResponse> {
  const result = await query<UserRow>(
    `SELECT users.*, organizations.name AS organization_name,
     organizations.work_item_id_prefix, organizations.invoice_id_prefix, organizations.currency_code
     FROM users
     JOIN organizations ON organizations.id = users.organization_id
     WHERE users.id = $1 AND users.active = TRUE`,
    [targetUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthError('That user could not be found or is inactive.', 404);
  }

  const { token } = await issueSession(row.id);
  await logPlatformEvent('impersonation_started', {
    organizationId: row.organization_id,
    actorUserId: actor.id,
    actorEmail: actor.email,
    targetUserId: row.id,
    message: `${actor.email} started impersonating ${row.email} (${row.organization_name}).`,
  });
  return { token, user: toAuthUser(row) };
}

export async function listPlatformEvents(limit: number): Promise<PlatformEvent[]> {
  const result = await query<{
    id: string;
    created_at: string;
    event_type: string;
    organization_id: string | null;
    actor_email: string | null;
    message: string;
  }>(
    'SELECT id, created_at, event_type, organization_id, actor_email, message FROM platform_events ORDER BY created_at DESC LIMIT $1',
    [limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    createdAt: formatStamp(row.created_at),
    eventType: row.event_type,
    organizationId: row.organization_id,
    actorEmail: row.actor_email,
    message: row.message,
  }));
}

export async function updateOrganizationSettings(organizationId: string, userId: string, patch: OrganizationSettingsPatch): Promise<AuthUser> {
  const sets: string[] = [];
  const values: unknown[] = [organizationId];

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length < 2) {
      throw new AuthError('Organization name must be at least 2 characters.');
    }
    values.push(trimmed);
    sets.push(`name = $${values.length}`);
  }

  if (patch.workItemIdPrefix !== undefined) {
    const trimmed = patch.workItemIdPrefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(trimmed)) {
      throw new AuthError('Work item ID prefix must be 1-8 letters or numbers.');
    }
    values.push(trimmed);
    sets.push(`work_item_id_prefix = $${values.length}`);
  }

  if (patch.invoiceIdPrefix !== undefined) {
    const trimmed = patch.invoiceIdPrefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(trimmed)) {
      throw new AuthError('Invoice ID prefix must be 1-8 letters or numbers.');
    }
    values.push(trimmed);
    sets.push(`invoice_id_prefix = $${values.length}`);
  }

  if (patch.currencyCode !== undefined) {
    if (!/^[A-Z]{3}$/.test(patch.currencyCode)) {
      throw new AuthError('Currency code must be a 3-letter code.');
    }
    values.push(patch.currencyCode);
    sets.push(`currency_code = $${values.length}`);
  }

  if (sets.length > 0) {
    const result = await query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $1`, values);
    if (result.rowCount === 0) {
      throw new AuthError('Organization not found.', 404);
    }
  }

  const userResult = await query<UserRow>(
    `SELECT users.*, organizations.name AS organization_name,
     organizations.work_item_id_prefix, organizations.invoice_id_prefix, organizations.currency_code
     FROM users
     JOIN organizations ON organizations.id = users.organization_id
     WHERE users.id = $1`,
    [userId],
  );
  if (!userResult.rows[0]) {
    throw new AuthError('User not found.', 404);
  }

  return toAuthUser(userResult.rows[0]);
}

export async function bulkCreateUsers(rows: BulkUserRow[], organizationId: string, actorName: string): Promise<BulkUserCreationResult> {
  const created: BulkUserCreationResult['created'] = [];
  const failed: BulkUserCreationResult['failed'] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const temporaryPassword = randomBytes(9).toString('base64url');
      const next = validateUserDraft(
        { name: row.name, email: row.email, profile: row.profile, password: temporaryPassword, active: true },
        true,
      );

      const duplicate = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [next.email]);
      if (duplicate.rowCount && duplicate.rowCount > 0) {
        throw new AuthError('A user with this email already exists.');
      }

      const { salt, hash } = await hashPassword(temporaryPassword);
      await query(
        `INSERT INTO users (id, organization_id, name, email, role, profile, password_hash, password_salt, active, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9)`,
        [`user-${randomBytes(8).toString('hex')}`, organizationId, next.name, next.email, roleForProfile[next.profile], next.profile, hash, salt, actorName],
      );

      created.push({ name: next.name, email: next.email, profile: next.profile, temporaryPassword });
    } catch (error) {
      failed.push({ row: index + 1, reason: error instanceof Error ? error.message : 'Unable to create this user.' });
    }
  }

  return { created, failed };
}

export async function logoutToken(token: string) {
  await query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export function canAccessModule(user: AuthUser, moduleId: ModuleId) {
  return user.moduleAccess.includes(moduleId);
}

export async function listUsers(organizationId: string): Promise<ManagedUser[]> {
  const result = await query<UserRow>(
    `SELECT users.*, organizations.name AS organization_name,
     organizations.work_item_id_prefix, organizations.invoice_id_prefix, organizations.currency_code
     FROM users
     JOIN organizations ON organizations.id = users.organization_id
     WHERE users.organization_id = $1
     ORDER BY users.created_at DESC, users.name ASC`,
    [organizationId],
  );
  return result.rows.map(toManagedUser);
}

export async function createUser(draft: UserDraft, organizationId: string, actorName: string): Promise<ManagedUser[]> {
  const next = validateUserDraft(draft, true);
  const duplicate = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [next.email]);
  if (duplicate.rowCount && duplicate.rowCount > 0) {
    throw new AuthError('A user with this email already exists.', 409);
  }

  const { salt, hash } = await hashPassword(next.password);
  await query(
    `INSERT INTO users (id, organization_id, name, email, role, profile, password_hash, password_salt, active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      `user-${randomBytes(8).toString('hex')}`,
      organizationId,
      next.name,
      next.email,
      roleForProfile[next.profile],
      next.profile,
      hash,
      salt,
      next.active,
      actorName,
    ],
  );

  return listUsers(organizationId);
}

export async function updateUser(id: string, draft: UserDraft, organizationId: string, actorUserId: string, actorName: string): Promise<ManagedUser[]> {
  const next = validateUserDraft(draft, false);
  const existing = await query<UserRow>('SELECT * FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);
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
      `UPDATE users SET name = $3, email = $4, role = $5, profile = $6, active = $7, password_hash = $8, password_salt = $9, updated_at = NOW(), updated_by = $10 WHERE id = $1 AND organization_id = $2`,
      [id, organizationId, next.name, next.email, roleForProfile[next.profile], next.profile, next.active, hash, salt, actorName],
    );
  } else {
    await query(
      'UPDATE users SET name = $3, email = $4, role = $5, profile = $6, active = $7, updated_at = NOW(), updated_by = $8 WHERE id = $1 AND organization_id = $2',
      [id, organizationId, next.name, next.email, roleForProfile[next.profile], next.profile, next.active, actorName],
    );
  }

  if (!next.active) {
    await query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
  }

  return listUsers(organizationId);
}

export async function deleteUser(id: string, organizationId: string, actorUserId: string): Promise<ManagedUser[]> {
  if (id === actorUserId) {
    throw new AuthError('You cannot delete your own account.', 400);
  }

  const existing = await query<UserRow>('SELECT * FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  if (!existing.rows[0]) {
    throw new AuthError('User not found.', 404);
  }

  if (existing.rows[0].profile === 'admin') {
    const otherAdmins = await query<{ id: string }>(
      "SELECT id FROM users WHERE profile = 'admin' AND active = TRUE AND id <> $1 AND organization_id = $2",
      [id, organizationId],
    );
    if (!otherAdmins.rowCount || otherAdmins.rowCount === 0) {
      throw new AuthError('Cannot delete the only active admin account.', 400);
    }
  }

  await query('DELETE FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);

  return listUsers(organizationId);
}
