import { hasKey } from '@valdren/i18n';
import { describe, expect, it } from 'vitest';
import { errors } from '../src/errors.ts';

describe('error messages', () => {
  it('every error code has a pt-BR translation', () => {
    const keys = Object.values(errors).map((make) => make('x').messageKey);
    expect(keys.filter((k) => !hasKey(k))).toEqual([]);
    expect(hasKey('error.internal')).toBe(true);
  });
});
