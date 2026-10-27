import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { paths } from '../config.js';
import { MongoClient, MongoError } from './mongo.js';

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

/** JWT HS256 (mismo formato que `jsonwebtoken.sign`), sin dependencias. */
export const signJwt = (payload: Record<string, unknown>, secret: string): string => {
  const unsigned = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
};

export const readEnvValue = (content: string, key: string): string | null => {
  for (const line of content.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match && match[1] === key) return (match[2] ?? '').trim().replace(/^["']|["']$/g, '');
  }
  return null;
};

export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
}

export interface PanelSession {
  userId: string;
  email: string;
  refreshToken: string;
  createdAt: string;
  expiresAt: string;
}

export interface MintedSession {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
  frontUrl: string;
  expiresAt: string;
}

const registry = () => join(paths.data, 'sessions.json');
const loadRegistry = (): PanelSession[] => {
  try {
    return existsSync(registry()) ? (JSON.parse(readFileSync(registry(), 'utf8')) as PanelSession[]) : [];
  } catch {
    return [];
  }
};
const saveRegistry = (sessions: PanelSession[]): void => {
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(registry(), JSON.stringify(sessions, null, 2), { mode: 0o600 });
};

/**
 * Sesiones de prueba (solo entorno local): se firma un refresh token con el JWT_SECRET de `security`, se registra en
 * su colección `tokens` y se devuelve para sembrar el navegador. El panel recuerda lo que creó para poder limpiarlo.
 */
export class SessionService {
  private readonly mongo: MongoClient;

  constructor(private readonly config: DevPanelConfig, mongo?: MongoClient) {
    this.mongo = mongo ?? new MongoClient(config);
  }

  private secret(): string {
    const file = this.config.session.securityEnv || join(this.config.paths.projects, 'security', '.env');
    if (!existsSync(file)) throw new MongoError(`No existe ${file}`, 500);
    const value = readEnvValue(readFileSync(file, 'utf8'), this.config.session.jwtKey);
    if (!value) throw new MongoError(`No se encontró ${this.config.session.jwtKey} en ${file}`, 500);
    return value;
  }

  async searchUsers(query: string): Promise<SessionUser[]> {
    const pattern = escapeRegex(query.trim().slice(0, 60));
    if (pattern.length < 2) return [];
    const js = `var re=new RegExp(${JSON.stringify(pattern)},"i");print(JSON.stringify(db.users.find({$or:[{email:re},{displayName:re}]},{email:1,displayName:1,role:1}).limit(20).toArray().map(function(u){return {id:u._id.str,email:u.email||"",name:u.displayName||"",role:u.role||null}})))`;
    return JSON.parse(await this.mongo.evalJs(this.config.session.db, js)) as SessionUser[];
  }

  private async findUser(userId: string): Promise<SessionUser> {
    if (!/^[a-f0-9]{24}$/.test(userId)) throw new MongoError('Usuario inválido');
    const js = `var u=db.users.findOne({_id:ObjectId(${JSON.stringify(userId)})},{email:1,displayName:1,role:1});print(u?JSON.stringify({id:u._id.str,email:u.email||"",name:u.displayName||"",role:u.role||null}):"")`;
    const out = await this.mongo.evalJs(this.config.session.db, js);
    if (!out) throw new MongoError('El usuario no existe', 404);
    return JSON.parse(out) as SessionUser;
  }

  async mint(userId: string, now = Math.floor(Date.now() / 1000)): Promise<MintedSession> {
    if (!this.config.session.enabled) throw new MongoError('Las sesiones de prueba están deshabilitadas', 403);
    const user = await this.findUser(userId);
    const secret = this.secret();
    const { accessTtlSec, refreshTtlSec } = this.config.session;
    // `jti` evita que dos sesiones del mismo usuario creadas en el mismo segundo produzcan el mismo token.
    const refreshToken = signJwt({ sub: user.id, iat: now, exp: now + refreshTtlSec, type: 'refresh', jti: randomBytes(6).toString('hex') }, secret);
    const accessToken = signJwt({ sub: user.id, iat: now, exp: now + accessTtlSec, type: 'access' }, secret);
    const record = `{token:${JSON.stringify(refreshToken)},user:${JSON.stringify(user.id)},type:"refresh",expires:new Date(${(now + refreshTtlSec) * 1000}),blacklisted:false,createdAt:new Date(),updatedAt:new Date(),__v:0}`;
    await this.mongo.evalJs(this.config.session.db, `db.tokens.insertOne(${record});print("ok")`);
    const expiresAt = new Date((now + refreshTtlSec) * 1000).toISOString();
    saveRegistry([...loadRegistry(), { userId: user.id, email: user.email, refreshToken, createdAt: new Date(now * 1000).toISOString(), expiresAt }]);
    return { user, accessToken, refreshToken, frontUrl: this.config.session.frontUrl, expiresAt };
  }

  list(): Array<Omit<PanelSession, 'refreshToken'> & { id: string }> {
    return loadRegistry().map(({ refreshToken, ...rest }) => ({ id: refreshToken.slice(-12), ...rest }));
  }

  /** Borra de `tokens` solo lo que creó el panel (todo, o una sesión por su id). */
  async revoke(id?: string): Promise<number> {
    const sessions = loadRegistry();
    const targets = id ? sessions.filter((session) => session.refreshToken.slice(-12) === id) : sessions;
    if (!targets.length) return 0;
    const tokens = targets.map((session) => session.refreshToken);
    const out = await this.mongo.evalJs(this.config.session.db, `print(db.tokens.deleteMany({token:{$in:${JSON.stringify(tokens)}}}).deletedCount)`);
    saveRegistry(sessions.filter((session) => !tokens.includes(session.refreshToken)));
    return Number(out);
  }
}
