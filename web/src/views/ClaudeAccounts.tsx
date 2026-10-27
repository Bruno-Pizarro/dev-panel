import { Check, Copy, KeyRound, LogIn, Plus, Trash2, UserRoundCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { PathField } from '../components/PathField';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { UsageBar } from '../components/UsageBar';
import { api } from '../lib/api';
import { pillStyle, tint } from '../lib/colors';
import { usePolling } from '../lib/hooks';
import type { ClaudeAccount, ClaudeLogin } from '../lib/types';

const COLORS = ['99 179 237', '167 139 250', '244 114 182', '251 146 60', '74 222 128', '45 212 191'];

const ago = (seconds: number) => (seconds < 90 ? 'recién' : seconds < 3600 ? `hace ${Math.round(seconds / 60)} min` : seconds < 172_800 ? `hace ${Math.round(seconds / 3600)} h` : `hace ${Math.round(seconds / 86_400)} días`);

const CopyLine = ({ label, text }: { label: string; text: string }) => {
  const toast = useToast();
  return (
    <div>
      <div className="mb-1 text-sm text-muted">{label}</div>
      <div className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm">{text}</pre>
        <Button className="h-9 shrink-0" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(text).then(() => toast('success', 'Copiado.'), () => toast('error', 'No se pudo copiar.'))}>Copiar</Button>
      </div>
    </div>
  );
};

/** Inicio de sesión desde el panel: muestra el enlace de Anthropic y reenvía el código que pegás. Las credenciales las escribe la CLI de Claude. */
const LoginModal = ({ account, onClose, onDone }: { account: ClaudeAccount | null; onClose: () => void; onDone: () => void }) => {
  const toast = useToast();
  const [login, setLogin] = useState<ClaudeLogin | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!account || started.current === account.id) return;
    started.current = account.id;
    setCode('');
    api.post<{ login: ClaudeLogin }>('/api/claude/login', { id: account.id }).then((result) => setLogin(result.login), (error: Error) => toast('error', error.message));
  }, [account, toast]);

  useEffect(() => {
    if (!account) return;
    const timer = window.setInterval(() => api.get<{ login: ClaudeLogin }>('/api/claude/login').then((result) => setLogin(result.login), () => undefined), 1500);
    return () => window.clearInterval(timer);
  }, [account]);

  useEffect(() => {
    if (login?.status === 'done') onDone();
  }, [login?.status, onDone]);

  const close = () => {
    void api.post('/api/claude/login/cancel');
    started.current = null;
    setLogin(null);
    onClose();
  };

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/api/claude/login/code', { code: code.trim() });
      toast('info', 'Código enviado, verificando…');
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={account !== null} title={`Iniciar sesión · ${account?.label ?? ''}`} onClose={close} size="xl">
      {!login || login.status === 'starting' ? <Skeleton className="h-24" /> : login.status === 'error' ? (
        <p className="text-danger">{login.message ?? 'No se pudo iniciar sesión'}</p>
      ) : login.status === 'done' ? (
        <p className="flex items-center gap-2 text-success"><Check className="size-5" aria-hidden /> Sesión iniciada.</p>
      ) : (
        <ol className="space-y-5">
          <li>
            <div className="mb-2 font-medium">1. Abrí el enlace e iniciá sesión con la cuenta que corresponda</div>
            <a href={login.url ?? '#'} target="_blank" rel="noreferrer noopener" className="block break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-accent hover:underline">{login.url}</a>
            <p className="mt-2 text-sm text-muted">Si ya estás logueado en el navegador con otra cuenta de Claude, usá una ventana privada o cerrá sesión primero: se usa la cuenta con la que entres ahí.</p>
          </li>
          <li>
            <div className="mb-2 font-medium">2. Pegá acá el código que te muestra Anthropic</div>
            <div className="flex gap-2">
              <input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && code.trim() && send()} placeholder="Código de autorización" className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3.5 font-mono text-sm outline-none placeholder:text-muted focus:border-accent/60" />
              <Button variant="primary" icon={<KeyRound className="size-4" />} loading={busy} disabled={code.trim().length < 8} onClick={send}>Enviar</Button>
            </div>
          </li>
          <li className="text-sm text-muted">El panel no guarda ni lee el código ni las credenciales: se los pasa a la CLI de Claude, que las escribe en la carpeta de la cuenta.</li>
        </ol>
      )}
    </Modal>
  );
};

const AddAccountModal = ({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) => {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLORS[0]!);
  const [configDir, setConfigDir] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await api.post('/api/claude/accounts', { label, color, ...(configDir ? { configDir } : {}) });
      setLabel('');
      setConfigDir('');
      onAdded();
      onClose();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Agregar cuenta" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!label.trim()} onClick={add}>Agregar</Button></>}>
      <div className="space-y-5">
        <Field label="Nombre" help="Por ejemplo: Trabajo o Personal." value={label} mono={false} onChange={setLabel} />
        <div>
          <div className="mb-2 font-medium">Color</div>
          <div className="flex gap-2">{COLORS.map((item) => <button key={item} type="button" aria-label={`Color ${item}`} onClick={() => setColor(item)} className="size-8 rounded-full border-2" style={{ backgroundColor: tint(item, 0.9), borderColor: color === item ? 'white' : 'transparent' }} />)}</div>
        </div>
        <PathField label="Carpeta de configuración (opcional)" help="Cada cuenta guarda sus credenciales, historial y ajustes en su propia carpeta. Vacío = ~/.claude-<nombre>." value={configDir} onChange={setConfigDir} />
      </div>
    </Modal>
  );
};

export const ClaudeAccounts = () => {
  const toast = useToast();
  const data = usePolling(() => api.get<{ activeId: string | null; accounts: ClaudeAccount[]; collector: { command: string; settings: string } }>('/api/claude/accounts'), 15_000);
  const [adding, setAdding] = useState(false);
  const [loginFor, setLoginFor] = useState<ClaudeAccount | null>(null);
  const [removing, setRemoving] = useState<ClaudeAccount | null>(null);

  const activate = async (account: ClaudeAccount) => {
    try {
      await api.post('/api/claude/active', { id: account.id });
      toast('success', `${account.label} es ahora la cuenta activa del panel.`);
      data.refresh();
    } catch (error) {
      toast('error', (error as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="Cuentas de Claude" description="Una carpeta de configuración por cuenta. La activa es la que se muestra en la barra de arriba." actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Agregar cuenta</Button>} />
      <p className="mb-5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
        El panel <strong className="text-fg">nunca lee ni guarda tus credenciales</strong>: consulta el estado a la propia CLI de Claude (<span className="font-mono">claude auth status</span>) y el uso lo toma del caché de límites que Claude Code guarda en <span className="font-mono">.claude.json</span> (el mismo que muestra “Account &amp; usage”; solo se lee ese bloque) o, si es más reciente, del <span className="font-mono">statusLine</span>. “Activa” es la cuenta que muestra el panel; para que la extensión de VS Code o la terminal usen otra, hay que arrancarlas con su carpeta (comandos abajo).
      </p>

      {data.data && (
        <Card title="Colector del statusLine (opcional, para la terminal)" className="mb-5">
          <p className="mb-3 text-sm text-muted">Los porcentajes ya se leen del caché de Claude Code. Este colector solo suma datos más frescos cuando usás la CLI en terminal (la extensión de VS Code no lo ejecuta). Si lo querés, agregá esto al <span className="font-mono">settings.json</span> de cada cuenta (<span className="font-mono">~/.claude/settings.json</span> o el de su carpeta). Claude Code le pasa al script los datos de la sesión (sin credenciales) y el panel los muestra. Solo Pro y Max, y aparecen después de la primera respuesta de cada sesión.</p>
          <CopyLine label="Fragmento para settings.json" text={data.data.collector.settings} />
        </Card>
      )}

      {!data.data ? <Skeleton className="h-64" /> : data.data.accounts.length === 0 ? (
        <EmptyState icon={<UserRoundCheck className="size-6" />} title="Sin cuentas">Agregá una cuenta para empezar.</EmptyState>
      ) : (
        <div className="space-y-5">
          {data.data.accounts.map((account) => {
            const active = data.data!.activeId === account.id;
            return (
              <Card key={account.id} className="overflow-hidden !p-0">
                <div className="p-5" style={{ boxShadow: `inset 4px 0 0 ${tint(account.color, 0.9)}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-lg border px-2.5 py-1 text-lg font-semibold" style={pillStyle(account.color, true)}>{account.label}</span>
                        {active && <Badge tone="success"><Check className="mr-1 size-4" aria-hidden />Activa</Badge>}
                        {account.status.plan && <Badge tone="accent">{account.status.plan}</Badge>}
                        <Badge tone={account.status.loggedIn ? 'success' : 'warning'}>{account.status.loggedIn ? 'Sesión iniciada' : 'Sin sesión'}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted">{account.status.email ? <><span className="text-fg">{account.status.email}</span>{account.status.orgName ? ` · ${account.status.orgName}` : ''}</> : 'Todavía no inició sesión con esta carpeta.'}</div>
                      <div className="mt-1 font-mono text-sm text-muted">{account.configDir}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!active && <Button className="h-9" icon={<UserRoundCheck className="size-4" />} onClick={() => activate(account)}>Usar en el panel</Button>}
                      <Button className="h-9" variant={account.status.loggedIn ? 'secondary' : 'primary'} icon={<LogIn className="size-4" />} onClick={() => setLoginFor(account)}>{account.status.loggedIn ? 'Volver a iniciar sesión' : 'Iniciar sesión'}</Button>
                      {account.id !== 'default' && <Button className="h-9" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(account)}>Quitar</Button>}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <UsageBar label="Sesión de 5 h" window={account.usage?.fiveHour ?? null} />
                      <UsageBar label="Semana" window={account.usage?.sevenDay ?? null} />
                      <p className="text-sm text-muted">
                        {account.usage ? <>Último dato {ago(account.usage.ageSeconds)} · fuente: {account.usage.source === 'cache' ? 'caché de Claude Code (no oficial)' : 'statusLine (oficial)'}{account.usage.model ? ` · ${account.usage.model}` : ''}{account.usage.costUsd !== null ? ` · ${account.usage.costUsd.toFixed(2)} USD estimados en esa sesión` : ''}.</> : 'Sin datos de uso: Claude Code los guarda cuando abrís “Account & usage” o corre una sesión con esta cuenta.'}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <CopyLine label="Terminal" text={account.snippets.terminal} />
                      <CopyLine label="VS Code (lanzado desde la terminal)" text={account.snippets.vscodeCode} />
                      {account.snippets.vscodeSetting && <CopyLine label="Ajuste de la extensión de VS Code (settings.json de VS Code)" text={account.snippets.vscodeSetting} />}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddAccountModal open={adding} onClose={() => setAdding(false)} onAdded={data.refresh} />
      <LoginModal account={loginFor} onClose={() => setLoginFor(null)} onDone={() => { data.refresh(); window.setTimeout(() => setLoginFor(null), 1200); }} />
      <ConfirmModal open={removing !== null} title="Quitar cuenta" confirmLabel="Quitar" danger onCancel={() => setRemoving(null)} onConfirm={async () => { try { await api.del(`/api/claude/accounts/${removing!.id}`); data.refresh(); } catch (error) { toast('error', (error as Error).message); } setRemoving(null); }}>
        Se quita <span className="text-fg">{removing?.label}</span> de la lista del panel. No se borra su carpeta ni se cierra su sesión.
      </ConfirmModal>
    </>
  );
};
