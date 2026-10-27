/** Une clases ignorando valores vacíos (alternativa mínima a clsx). */
export const cn = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');
