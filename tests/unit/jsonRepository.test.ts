import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonRepository } from '../../electron/main/persistence/jsonRepository';

describe('JsonRepository', () => {
  it('壊れたJSONの時にバックアップ復元する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stackpilot-'));
    const path = join(dir, 'data.json');
    await writeFile(path, '{broken', 'utf8');
    await writeFile(`${path}.bak`, JSON.stringify({ version: 1, workspaces: [] }), 'utf8');

    const repository = new JsonRepository(path, () => ({ version: 1, workspaces: ['default'] as string[] }));
    const loaded = await repository.load();

    expect(loaded).toEqual({ version: 1, workspaces: [] });
  });
});
