import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { EnvProfileError, applyProfile, inspectEnv, maskLine } from './envProfiles.js';

const profiles = defaultConfig('/work').envProfiles;
const firma = profiles['firma']!;
const fileManager = profiles['file-manager']!;
const documentos = profiles['documentos']!;

const BLOCK = ['AWS_ACCESS_KEY_ID=minioadmin', 'AWS_SECRET_ACCESS_KEY=minioadmin', 'AWS_REGION=us-east-1', 'AWS_S3_BUCKET_NAME=esueldos-s3', 'AWS_ENDPOINT=http://minio:9000', 'AWS_S3_PUBLIC_URL=http://localhost:9000', 'AWS_S3_FORCE_PATH_STYLE=true', 'USE_MINIO=true'];
const commented = (lines: string[]) => lines.map((line) => `# ${line}`);
const firmaLocal = ['PORT=3010', ...BLOCK].join('\n');
const firmaRemote = ['PORT=3010', ...commented(BLOCK)].join('\n');

describe('inspectEnv', () => {
  it('detecta el estado local (bloque activo) y el remoto (bloque comentado)', () => {
    expect(inspectEnv(firmaLocal, firma).state).toBe('local');
    expect(inspectEnv(firmaRemote, firma).state).toBe('remote');
  });

  it('enmascara claves y secretos en lo que devuelve', () => {
    const text = inspectEnv(firmaLocal, firma).managed.map((item) => item.text).join('\n');
    expect(text).toContain('AWS_ACCESS_KEY_ID=••••••');
    expect(text).toContain('AWS_SECRET_ACCESS_KEY=••••••');
    expect(text).not.toMatch(/minioadmin/);
    expect(text).toContain('AWS_REGION=us-east-1');
  });

  it('un archivo a medias es "mixed"', () => {
    const mixed = ['PORT=1', ...BLOCK.slice(0, 4), ...commented(BLOCK.slice(4))].join('\n');
    expect(inspectEnv(mixed, firma).state).toBe('mixed');
  });

  it('claves duplicadas (dos bloques AWS) son conflicto y no se decide nada', () => {
    const duplicated = [...BLOCK, 'AWS_REGION=us-east-1', 'AWS_S3_BUCKET_NAME=otro'].join('\n');
    const result = inspectEnv(duplicated, firma);
    expect(result.state).toBe('unknown');
    expect(result.conflicts.join(' ')).toMatch(/AWS_REGION/);
  });

  it('claves ausentes se informan como faltantes', () => {
    expect(inspectEnv('PORT=1', firma).missing).toHaveLength(8);
  });
});

describe('applyProfile', () => {
  it('local → remoto comenta el bloque y local ← remoto lo descomenta, sin tocar valores ni otras líneas', () => {
    const toRemote = applyProfile(firmaLocal, firma, 'remote');
    expect(toRemote.content).toBe(firmaRemote);
    expect(toRemote.changes).toHaveLength(8);
    expect(applyProfile(firmaRemote, firma, 'local').content).toBe(firmaLocal);
  });

  it('es idempotente: aplicar el perfil que ya está no cambia nada', () => {
    expect(applyProfile(firmaLocal, firma, 'local')).toEqual({ content: firmaLocal, changes: [] });
  });

  it('file-manager alterna también USE_MINIO=false y respeta comentarios al final de la línea', () => {
    const remoteLines = ['USE_MINIO=false', 'AWS_S3_PUBLIC_URL=https://appv3-desa.s3.amazonaws.com', 'AWS_S3_FORCE_PATH_STYLE=false'];
    const commentedKeepRegion = BLOCK.map((line) => (line.startsWith('AWS_REGION') ? line : `# ${line}`));
    const remote = [...commentedKeepRegion, '', '# Habilitar MinIO', '# deshabilitar en prod', ...remoteLines].join('\n');
    const local = [...BLOCK, '', '# Habilitar MinIO', '# deshabilitar en prod', ...commented(remoteLines)].join('\n');
    expect(inspectEnv(remote, fileManager).state).toBe('remote');
    expect(inspectEnv(local, fileManager).state).toBe('local');
    expect(applyProfile(remote, fileManager, 'local').content).toBe(local);
    expect(applyProfile(local, fileManager, 'remote').content).toBe(remote);
    const withInline = ['AWS_ENDPOINT=http://minio:9000        # para el SDK', ...BLOCK.filter((line) => !line.startsWith('AWS_ENDPOINT'))].join('\n');
    expect(applyProfile(withInline, firma, 'remote').content).toContain('# AWS_ENDPOINT=http://minio:9000        # para el SDK');
  });

  it('con claves repetidas o ausentes no escribe: lanza error', () => {
    expect(() => applyProfile([...BLOCK, 'AWS_REGION=us-east-1'].join('\n'), firma, 'remote')).toThrow(EnvProfileError);
    expect(() => applyProfile('PORT=1', firma, 'local')).toThrow(/No se encontraron/);
  });

  it('los cambios devueltos no filtran secretos', () => {
    const { changes } = applyProfile(firmaLocal, firma, 'remote');
    expect(JSON.stringify(changes)).not.toMatch(/minioadmin/);
  });
});

describe('maskLine', () => {
  it('enmascara solo claves sensibles', () => {
    expect(maskLine('JWT_SECRET=abc')).toBe('JWT_SECRET=••••••');
    expect(maskLine('PORT=3010')).toBe('PORT=3010');
    expect(maskLine('# AWS_SECRET_ACCESS_KEY=x')).toBe('# AWS_SECRET_ACCESS_KEY=••••••');
  });
});

describe('perfiles con bloques repetidos (documentos y file-manager reales)', () => {
  const remoteBlock = ['AWS_ACCESS_KEY_ID=AKIAEXAMPLE', 'AWS_SECRET_ACCESS_KEY=secreto-remoto', 'AWS_REGION=us-east-1', 'AWS_S3_BUCKET_NAME=appv3-desa', '', 'USE_MINIO=false', '# AWS_ENDPOINT=http://minio:9000 (MinIO - deshabilitado)', 'AWS_S3_PUBLIC_URL=https://appv3-desa.s3.amazonaws.com', 'AWS_S3_FORCE_PATH_STYLE=false'];
  const minioBlock = ['AWS_ACCESS_KEY_ID=minioadmin', 'AWS_SECRET_ACCESS_KEY=minioadmin', 'AWS_REGION=us-east-1', 'AWS_S3_BUCKET_NAME=esueldos-s3', 'AWS_ENDPOINT=http://minio:9000        # para el SDK', 'AWS_S3_PUBLIC_URL=http://localhost:9000   # para armar links públicos', 'AWS_S3_FORCE_PATH_STYLE=true', 'USE_MINIO=true #! deshabilitar en prod'];
  const toggled = (lines: string[], on: (line: string) => boolean) => lines.map((line) => (on(line) && line && !line.startsWith('#') ? `# ${line}` : line));
  const isMinioLine = (line: string) => minioBlock.includes(line) && !line.startsWith('AWS_REGION');

  it('documentos con el bloque remoto activo es "remote" y se puede pasar a local comentando el remoto y descomentando MinIO', () => {
    const remote = ['PORT=3007', ...remoteBlock, '', ...toggled(minioBlock, isMinioLine)].join('\n');
    expect(inspectEnv(remote, documentos).state).toBe('remote');
    const local = applyProfile(remote, documentos, 'local');
    expect(inspectEnv(local.content, documentos).state).toBe('local');
    expect(local.content).toContain('# AWS_ACCESS_KEY_ID=AKIAEXAMPLE');
    expect(local.content).toContain('\nAWS_ACCESS_KEY_ID=minioadmin');
    expect(local.content).toContain('# AWS_S3_PUBLIC_URL=https://appv3-desa.s3.amazonaws.com');
    expect(local.content).toContain('USE_MINIO=true #! deshabilitar en prod');
    expect(local.content).toContain('# AWS_ENDPOINT=http://minio:9000 (MinIO - deshabilitado)');
    expect(JSON.stringify(local.changes)).not.toMatch(/AKIAEXAMPLE|secreto-remoto/);
    // y de vuelta al remoto, idéntico al original
    expect(applyProfile(local.content, documentos, 'remote').content).toBe(remote);
  });

  it('con los dos bloques activos a la vez (estado mixto real) normaliza a lo que se pide', () => {
    const both = ['PORT=3007', ...remoteBlock, '', ...minioBlock].join('\n');
    expect(inspectEnv(both, documentos).state).toBe('mixed');
    expect(inspectEnv(applyProfile(both, documentos, 'local').content, documentos).state).toBe('local');
    expect(inspectEnv(applyProfile(both, documentos, 'remote').content, documentos).state).toBe('remote');
  });
});
