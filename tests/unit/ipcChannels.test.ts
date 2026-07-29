import { describe, expect, it } from 'vitest';
import { CHANNELS } from '../../electron/main/ipc/channels';

describe('IPC channel contract', () => {
  it('channel文字列が重複していない', () => {
    const values = Object.values(CHANNELS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('channel文字列がnamespace:action形式になっている', () => {
    for (const value of Object.values(CHANNELS)) {
      expect(value).toMatch(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
    }
  });
});
