import { Download, Monitor } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useStoredState } from '../lib/hooks';
import { buildBat, validTarget } from '../lib/remoteBat';
import { useAsync } from '../lib/useAsync';
import { Button } from './Button';
import { Card } from './Card';
import { Field } from './Field';

/** Genera el .bat que se ejecuta en la otra PC para abrir el front y el panel de esta notebook en sus monitores. */
export const RemoteAccess = () => {
  const [host, setHost] = useStoredState('devpanel.remote.host', '');
  const [user, setUser] = useStoredState('devpanel.remote.user', '');
  const ports = useAsync(() => api.get<{ ports: number[] }>('/api/remote/ports'));
  const [copied, setCopied] = useState(false);
  const ok = validTarget(host.trim(), user.trim()) && !!ports.data;
  const bat = () => buildBat(host.trim(), user.trim(), ports.data?.ports ?? []);

  const download = () => {
    const url = URL.createObjectURL(new Blob([bat()], { type: 'application/x-bat' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dev-panel-remoto.bat';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card title="Para qué sirve">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Abre la aplicación y el Dev Panel de <strong className="text-fg">esta notebook</strong> en el navegador de otra PC de la misma red, sin pasar por Parsec: así podés usar todos tus monitores.</li>
          <li>El .bat crea túneles SSH: desde la otra PC, <span className="font-mono text-fg">localhost:4200</span> es el front de esta notebook y <span className="font-mono text-fg">localhost:5173</span> el panel, igual que acá. Por eso no hay que tocar ninguna configuración.</li>
          <li>Se ejecuta en la otra PC. Dejá la ventana abierta mientras trabajás; al cerrarla se cortan los túneles.</li>
        </ul>
      </Card>
      <Card title="Preparar la notebook (una sola vez)">
        <p className="mb-2 text-sm text-muted">En un PowerShell como administrador, en esta notebook, para tener el servidor SSH:</p>
        <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-sm">{`Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0\nSet-Service sshd -StartupType Automatic\nStart-Service sshd`}</pre>
        <p className="mt-2 text-sm text-muted">Usá la IP de esta notebook en la red (<span className="font-mono">ipconfig</span>) y tu usuario de Windows. Conviene una clave SSH en lugar de contraseña.</p>
      </Card>
      <Card title="Generar el .bat">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="IP o nombre de la notebook" placeholder="192.168.1.94" value={host} onChange={setHost} autoComplete="off" />
          <Field label="Usuario de Windows de la notebook" placeholder="usuario" value={user} onChange={setUser} autoComplete="off" />
        </div>
        <p className="mt-3 text-sm text-muted">Reenvía {ports.data ? `${ports.data.ports.length} puertos` : 'los puertos'} del compose, el front (4200) y el panel (5173).</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="primary" icon={<Download className="size-4" />} disabled={!ok} onClick={download}>Descargar .bat</Button>
          <Button icon={<Monitor className="size-4" />} disabled={!ok} onClick={() => void navigator.clipboard.writeText(bat()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>{copied ? 'Copiado' : 'Copiar contenido'}</Button>
        </div>
      </Card>
    </div>
  );
};
