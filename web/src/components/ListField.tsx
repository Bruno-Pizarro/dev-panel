import { useState } from 'react';
import { Field } from './Field';

interface ListFieldProps {
  label: string;
  help?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

const parse = (text: string): string[] => [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];

/** Lista separada por comas: guarda el texto mientras se escribe (así no se pierden las comas) y avisa la lista ya limpia. */
export const ListField = ({ label, help, value, onChange, placeholder }: ListFieldProps) => {
  const [text, setText] = useState(value.join(', '));
  // Si la lista cambia desde afuera (recarga de la config), se vuelve a mostrar; si es la que se está escribiendo, se respeta el texto.
  if (parse(text).join('\u0000') !== value.join('\u0000')) setText(value.join(', '));
  return (
    <Field
      label={label}
      {...(help ? { help } : {})}
      {...(placeholder ? { placeholder } : {})}
      value={text}
      onChange={(next) => {
        setText(next);
        onChange(parse(next));
      }}
    />
  );
};
