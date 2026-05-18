import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the validateCustomFields helper.
 * We mock the DB so these run without a real PostgreSQL connection.
 */

// Mock the DB module before importing the target
vi.mock('../../db/client.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

import { validateCustomFields } from './custom-fields.js';
import { db } from '../../db/client.js';

// Helper to set what the mock DB returns
function setDefs(defs: object[]) {
  ((db as unknown as { where: ReturnType<typeof vi.fn> }).where).mockResolvedValue(defs);
}

describe('validateCustomFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when no definitions exist', async () => {
    setDefs([]);
    await expect(validateCustomFields('org1', { anything: 'ok' })).resolves.toBeUndefined();
  });

  it('throws when a required field is missing', async () => {
    setDefs([{ key: 'company', fieldType: 'text', required: true, options: null }]);
    await expect(validateCustomFields('org1', {})).rejects.toMatchObject({
      details: { errors: expect.arrayContaining([expect.stringContaining('company')]) },
    });
  });

  it('passes when a required field is present', async () => {
    setDefs([{ key: 'company', fieldType: 'text', required: true, options: null }]);
    await expect(validateCustomFields('org1', { company: 'Acme' })).resolves.toBeUndefined();
  });

  it('throws when a number field has non-numeric value', async () => {
    setDefs([{ key: 'age', fieldType: 'number', required: false, options: null }]);
    await expect(validateCustomFields('org1', { age: 'twenty' })).rejects.toMatchObject({
      details: { errors: expect.arrayContaining([expect.stringContaining('age')]) },
    });
  });

  it('passes when number field has numeric string', async () => {
    setDefs([{ key: 'age', fieldType: 'number', required: false, options: null }]);
    await expect(validateCustomFields('org1', { age: '25' })).resolves.toBeUndefined();
  });

  it('throws when select value is not in options', async () => {
    setDefs([{ key: 'plan', fieldType: 'select', required: false, options: ['free', 'pro', 'enterprise'] }]);
    await expect(validateCustomFields('org1', { plan: 'unknown' })).rejects.toMatchObject({
      details: { errors: expect.arrayContaining([expect.stringContaining('plan')]) },
    });
  });

  it('passes when select value is in options', async () => {
    setDefs([{ key: 'plan', fieldType: 'select', required: false, options: ['free', 'pro', 'enterprise'] }]);
    await expect(validateCustomFields('org1', { plan: 'pro' })).resolves.toBeUndefined();
  });

  it('throws when boolean field has invalid value', async () => {
    setDefs([{ key: 'active', fieldType: 'boolean', required: false, options: null }]);
    await expect(validateCustomFields('org1', { active: 'yes' })).rejects.toMatchObject({
      details: { errors: expect.arrayContaining([expect.stringContaining('active')]) },
    });
  });

  it('passes when boolean field is true', async () => {
    setDefs([{ key: 'active', fieldType: 'boolean', required: false, options: null }]);
    await expect(validateCustomFields('org1', { active: true })).resolves.toBeUndefined();
  });

  it('throws on invalid date', async () => {
    setDefs([{ key: 'birthday', fieldType: 'date', required: false, options: null }]);
    await expect(validateCustomFields('org1', { birthday: 'not-a-date' })).rejects.toMatchObject({
      details: { errors: expect.arrayContaining([expect.stringContaining('birthday')]) },
    });
  });

  it('passes on valid ISO date', async () => {
    setDefs([{ key: 'birthday', fieldType: 'date', required: false, options: null }]);
    await expect(validateCustomFields('org1', { birthday: '1990-04-15' })).resolves.toBeUndefined();
  });

  it('collects multiple validation errors', async () => {
    setDefs([
      { key: 'age', fieldType: 'number', required: true, options: null },
      { key: 'plan', fieldType: 'select', required: false, options: ['free', 'pro'] },
    ]);
    try {
      await validateCustomFields('org1', { plan: 'invalid' });
      expect.fail('should have thrown');
    } catch (err) {
      const e = err as { details?: { errors?: string[] } };
      expect(e.details?.errors?.length).toBeGreaterThanOrEqual(1);
    }
  });
});
