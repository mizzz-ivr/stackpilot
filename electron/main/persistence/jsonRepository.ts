import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonRepository<T extends object> {
  constructor(private readonly path: string, private readonly createDefault: () => T) {}

  async load(): Promise<T> {
    try {
      const raw = await readFile(this.path, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      const fallback = await this.recoverFromBackup();
      if (fallback) return fallback;
      const initial = this.createDefault();
      await this.save(initial);
      return initial;
    }
  }

  async save(data: T): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const payload = JSON.stringify(data, null, 2);
    const tempPath = `${this.path}.tmp`;
    const backupPath = `${this.path}.bak`;

    await writeFile(tempPath, payload, 'utf8');

    try {
      await rename(this.path, backupPath);
    } catch {
      // ignore when file does not exist
    }

    await rename(tempPath, this.path);
  }

  private async recoverFromBackup(): Promise<T | null> {
    try {
      const raw = await readFile(`${this.path}.bak`, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
