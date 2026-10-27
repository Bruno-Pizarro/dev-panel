import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { paths } from '../config.js';

export const presetSchema = z.object({ name: z.string().trim().min(1).max(40), services: z.array(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)).max(40) });
export type Preset = z.infer<typeof presetSchema>;

const file = (dataDir: string) => join(dataDir, 'presets.json');

/** Presets personales de cada desarrollador (los compartidos viven en config.json). */
export const loadPersonalPresets = (dataDir: string = paths.data): Preset[] => {
  if (!existsSync(file(dataDir))) return [];
  try {
    const parsed = z.array(presetSchema).safeParse(JSON.parse(readFileSync(file(dataDir), 'utf8')));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

export const savePersonalPresets = (presets: Preset[], dataDir: string = paths.data): void => {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), `${JSON.stringify(presets, null, 2)}\n`);
};
