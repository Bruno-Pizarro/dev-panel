import { Plus, X } from 'lucide-react';
import { useState } from 'react';

interface TagEditorProps {
  label: string;
  help?: string;
  values: string[];
  onChange: (values: string[]) => void;
}

/** Lista editable de nombres (servicios de compose): chips con "x" y un campo para agregar. */
export const TagEditor = ({ label, help, values, onChange }: TagEditorProps) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft('');
  };
  return (
    <div>
      <div className="mb-1 font-medium">{label}</div>
      {help && <p className="mb-2 text-sm text-muted">{help}</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg p-2.5">
        {values.map((value) => (
          <span key={value} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 pl-3 pr-1.5 font-mono text-sm">
            {value}
            <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} className="rounded-full p-0.5 text-muted hover:bg-surface-3 hover:text-danger" aria-label={`Quitar ${value}`}>
              <X className="size-4" />
            </button>
          </span>
        ))}
        <div className="flex min-w-40 flex-1 items-center gap-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), add())}
            placeholder="Agregar…"
            className="h-8 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm outline-none placeholder:text-muted"
          />
          <button type="button" onClick={add} className="rounded-md p-1 text-muted hover:text-accent" aria-label="Agregar">
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
