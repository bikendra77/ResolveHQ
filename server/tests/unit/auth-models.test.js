import { describe, expect, it } from 'vitest';
import { RefreshToken } from '../../src/modules/auth/models/refresh-token.model.js';
import { User } from '../../src/modules/auth/models/user.model.js';

describe('authentication models', () => {
  it('normalizes and uniquely indexes email while hiding the password hash', () => {
    const user = new User({
      name: '  Test Person ',
      email: ' PERSON@EXAMPLE.COM ',
      passwordHash: 'bcrypt-hash',
    });

    expect(user.name).toBe('Test Person');
    expect(user.email).toBe('person@example.com');
    expect(User.schema.path('email').options.unique).toBe(true);
    expect(User.schema.path('passwordHash').options.select).toBe(false);
    expect(User.schema.options.timestamps).toBe(true);
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
  });

  it('indexes refresh token hashes uniquely and expires token records', () => {
    expect(RefreshToken.schema.path('tokenHash').options.unique).toBe(true);
    expect(RefreshToken.schema.path('tokenVersion').isRequired).toBe(true);
    expect(RefreshToken.schema.path('expiresAt').options.index.expires).toBe(0);
    expect(RefreshToken.schema.options.timestamps).toEqual({
      createdAt: true,
      updatedAt: false,
    });
  });
});
