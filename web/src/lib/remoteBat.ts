export const HOST_PATTERN = /^[A-Za-z0-9.-]{1,100}$/;
export const USER_PATTERN = /^[A-Za-z0-9._-]{1,60}$/;

/** Los comandos de cmd interpretan estos caracteres: el host y el usuario ya vienen validados, pero igual no se arma nada con ellos. */
export const validTarget = (host: string, user: string): boolean => HOST_PATTERN.test(host) && USER_PATTERN.test(user);

/**
 * .bat para la otra PC: abre túneles SSH hacia esta notebook (cada puerto queda como `localhost:<puerto>` allá, igual que acá) y
 * abre el front y el panel en el navegador. Mientras la ventana siga abierta los túneles funcionan; al cerrarla se cortan.
 */
export const buildBat = (host: string, user: string, ports: number[], open: number[] = [4200, 5173]): string => {
  if (!validTarget(host, user)) throw new Error('Host o usuario inválido');
  const forwards = ports.map((port) => `-L ${port}:localhost:${port}`).join(' ');
  const urls = open.map((port) => `start http://localhost:${port}`).join(' & ');
  return [
    '@echo off',
    'title Dev Panel - tuneles a la notebook',
    'echo Conectando con la notebook (%~nx0). Dejá esta ventana abierta: al cerrarla se cortan los tuneles.',
    `start "" /min cmd /c "timeout /t 4 >nul & ${urls}"`,
    `ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=no ${forwards} ${user}@${host}`,
    'echo.',
    'echo La conexion se cerro. Si fue un error, revisa que la notebook este encendida y con el servicio SSH activo.',
    'pause',
    '',
  ].join('\r\n');
};
