/** `mm:ss` (o `h:mm:ss` pasada la hora) para un tiempo en milisegundos. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pair = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pair(minutes)}:${pair(seconds)}` : `${pair(minutes)}:${pair(seconds)}`;
};
