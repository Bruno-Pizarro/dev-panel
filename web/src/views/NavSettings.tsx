import { Lock } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { useStoredState } from '../lib/hooks';
import { HIDDEN_NAV_KEY, LOCKED_NAV_PATHS, navGroups } from '../lib/nav';

/** Configuración → Menú lateral: quitar del menú lo que no se usa. Solo lo esconde (las pantallas y sus atajos siguen); se guarda en este navegador. */
export const NavSettings = () => {
  const [hidden, setHidden] = useStoredState<string[]>(HIDDEN_NAV_KEY, []);
  const toggle = (path: string) => setHidden(hidden.includes(path) ? hidden.filter((item) => item !== path) : [...hidden, path]);
  const optional = navGroups.flatMap((group) => group.items).filter((item) => !LOCKED_NAV_PATHS.includes(item.path));
  return (
    <Card title="Menú lateral" action={<Button disabled={hidden.length === 0} onClick={() => setHidden([])}>Mostrar todo</Button>}>
      <p className="mb-4 text-muted">Elegí qué pantallas querés ver en el menú lateral; las que apagues dejan de aparecer y los demás items ganan lugar. Solo se esconde del menú: la pantalla sigue existiendo, se abre con su atajo (<span className="font-mono">g</span> + letra) o con <span className="font-mono">Ctrl + K</span>, y podés volver a mostrarla cuando quieras.</p>
      <div className="space-y-4">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !LOCKED_NAV_PATHS.includes(item.path));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{group.label}</h3>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => <Chip key={item.path} selected={!hidden.includes(item.path)} onToggle={() => toggle(item.path)} hint={item.description}>{item.label}</Chip>)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden />Inicio, Claude y Configuración siempre están en el menú.</p>
      {optional.length > 0 && hidden.some((path) => optional.some((item) => item.path === path)) && <p className="mt-2 text-sm text-muted">Ocultas: {optional.filter((item) => hidden.includes(item.path)).map((item) => item.label).join(', ')}.</p>}
    </Card>
  );
};
