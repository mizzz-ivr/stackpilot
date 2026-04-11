import { describe, expect, it } from 'vitest';
import { getEnvironmentBadgeRule, isProdEnvironment } from '../../shared/domain/environment';

describe('environment badge rules', () => {
  it('prod は danger tone になる', () => {
    expect(getEnvironmentBadgeRule('prod').tone).toBe('danger');
  });

  it('local/dev は calm tone になる', () => {
    expect(getEnvironmentBadgeRule('local').tone).toBe('calm');
    expect(getEnvironmentBadgeRule('dev').tone).toBe('calm');
  });

  it('prod 判定', () => {
    expect(isProdEnvironment('prod')).toBe(true);
    expect(isProdEnvironment('stg')).toBe(false);
  });
});
