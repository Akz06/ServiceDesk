import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, UserDraft } from '../src/types';

const queryMock = vi.fn();
const withTransactionMock = vi.fn();

vi.mock('./db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (callback: (client: { query: typeof queryMock }) => Promise<unknown>) => withTransactionMock(callback),
}));

const {
  hashPassword,
  verifyPassword,
  validateUserDraft,
  normalizeProfile,
  slugify,
  isUniqueViolation,
  deleteUser,
  updateUser,
  createOrganizationWithAdmin,
  impersonateUser,
} = await import('./auth');

const platformAdminActor: AuthUser = {
  id: 'user-owner',
  name: 'Owner',
  email: 'owner@akzapps.in',
  role: 'Admin',
  profile: 'admin',
  moduleAccess: ['admin'],
  organizationId: 'org-owner',
  organizationName: 'Akz Apps',
  workItemIdPrefix: 'WI',
  invoiceIdPrefix: 'INV',
  currencyCode: 'USD',
  isPlatformAdmin: true,
};

const blankDraft: UserDraft = { name: 'Jane Doe', email: 'jane@example.com', profile: 'agent', password: 'Sup3rSecret1', active: true };

beforeEach(() => {
  queryMock.mockReset();
  withTransactionMock.mockReset();
});

describe('password hashing', () => {
  it('verifies the correct password against its own hash', async () => {
    const { salt, hash } = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', salt, hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const { salt, hash } = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('wrong-password', salt, hash)).resolves.toBe(false);
  });

  it('rejects the correct password against a different salt', async () => {
    const { hash } = await hashPassword('correct-horse-battery-staple', 'salt-one');
    await expect(verifyPassword('correct-horse-battery-staple', 'salt-two', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password with different salts', async () => {
    const first = await hashPassword('same-password', 'salt-a');
    const second = await hashPassword('same-password', 'salt-b');
    expect(first.hash).not.toBe(second.hash);
  });
});

describe('validateUserDraft / normalizeProfile', () => {
  it('accepts a valid draft and normalizes a mixed-case profile', () => {
    const result = validateUserDraft({ ...blankDraft, profile: 'Agent' as UserDraft['profile'] }, true);
    expect(result).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com', profile: 'agent' });
  });

  it('rejects a name under 2 characters', () => {
    expect(() => validateUserDraft({ ...blankDraft, name: 'J' }, true)).toThrow(/at least 2 characters/);
  });

  it('rejects an invalid email', () => {
    expect(() => validateUserDraft({ ...blankDraft, email: 'not-an-email' }, true)).toThrow(/valid email/);
  });

  it('rejects a password under 8 characters when required', () => {
    expect(() => validateUserDraft({ ...blankDraft, password: 'short' }, true)).toThrow(/at least 8 characters/);
  });

  it('allows an empty password when not required (no password change)', () => {
    expect(() => validateUserDraft({ ...blankDraft, password: '' }, false)).not.toThrow();
  });

  it('rejects an unknown profile string', () => {
    expect(() => normalizeProfile('superuser')).toThrow(/Invalid user profile/);
  });

  it('is case-insensitive for known profiles', () => {
    expect(normalizeProfile('ADMIN')).toBe('admin');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Acme Repair Co.')).toBe('acme-repair-co');
  });

  it('falls back to "org" when nothing alphanumeric remains', () => {
    expect(slugify('!!!')).toBe('org');
  });
});

describe('isUniqueViolation', () => {
  it('recognizes a Postgres unique-violation error code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('rejects an unrelated error', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
});

describe('organization scoping contract', () => {
  it('scopes deleteUser by organization_id in both the lookup and the delete', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) {
        return { rows: [{ id: 'user-1', profile: 'agent' }], rowCount: 1 };
      }
      if (sql.includes('SELECT users.*, organizations.name')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    await deleteUser('user-1', 'org-abc', 'user-actor');

    const scopedCalls = queryMock.mock.calls.filter(([, params]) => Array.isArray(params) && params.includes('org-abc'));
    expect(scopedCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('scopes updateUser by organization_id in the existence check and the update', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) {
        return { rows: [{ id: 'user-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM users WHERE email')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT users.*, organizations.name')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    await updateUser('user-1', { ...blankDraft, password: '' }, 'org-abc', 'user-1', 'Actor Name');

    const scopedCalls = queryMock.mock.calls.filter(([, params]) => Array.isArray(params) && params.includes('org-abc'));
    expect(scopedCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('createOrganizationWithAdmin slug retry', () => {
  it('retries with an incremented suffix when the slug already exists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE email')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    let attempt = 0;
    const clientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO organizations')) {
        attempt += 1;
        if (attempt === 1) {
          throw { code: '23505' };
        }
        return { rows: [], rowCount: 1, slug: params[2] };
      }
      if (sql.includes('INSERT INTO users')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT users.*, organizations.name')) {
        return {
          rows: [{
            id: 'user-new',
            organization_id: 'org-new',
            organization_name: 'Acme Repair Co',
            name: 'Jane Doe',
            email: 'jane@example.com',
            role: 'Admin',
            profile: 'admin',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    withTransactionMock.mockImplementation(async (callback: (client: { query: typeof clientQuery }) => Promise<unknown>) => callback({ query: clientQuery }));

    const result = await createOrganizationWithAdmin({
      organizationName: 'Acme Repair Co',
      adminName: 'Jane Doe',
      adminEmail: 'jane@example.com',
      adminPassword: 'Sup3rSecret1',
    });

    expect(attempt).toBe(2);
    expect(result.user.organizationName).toBe('Acme Repair Co');
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });
});

describe('impersonateUser', () => {
  it('issues a session for an active target user and records who did it', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT users.*, organizations.name')) {
        return {
          rows: [{
            id: 'user-target',
            organization_id: 'org-1',
            organization_name: 'Acme Repair Co',
            name: 'Target User',
            email: 'target@example.com',
            role: 'Admin',
            profile: 'admin',
            active: true,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await impersonateUser(platformAdminActor, 'user-target');

    expect(result.user.email).toBe('target@example.com');
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);

    const loggedEvent = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO platform_events'));
    expect(loggedEvent).toBeDefined();
    const params = loggedEvent?.[1] as unknown[];
    expect(params).toContain('impersonation_started');
    expect(params).toContain(platformAdminActor.email);
    expect(params).toContain('user-target');
  });

  it('refuses to impersonate a user that does not exist or is inactive', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT users.*, organizations.name')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(impersonateUser(platformAdminActor, 'missing-user')).rejects.toThrow(/could not be found/i);
  });
});
