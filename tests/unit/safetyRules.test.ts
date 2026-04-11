import { describe, expect, it } from 'vitest';
import { getSafetyLevelByEnvironment } from '../../shared/domain/safety';

describe('prod safety rules', () => {
  it('prod は danger', () => {
    expect(getSafetyLevelByEnvironment('prod')).toBe('danger');
  });

  it('stg は warning', () => {
    expect(getSafetyLevelByEnvironment('stg')).toBe('warning');
  });

  it('local/dev/custom は normal', () => {
    expect(getSafetyLevelByEnvironment('local')).toBe('normal');
    expect(getSafetyLevelByEnvironment('dev')).toBe('normal');
    expect(getSafetyLevelByEnvironment('custom')).toBe('normal');
  });
});
