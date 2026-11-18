import { describe, expect, it } from 'vitest';
import { splitNoticeMessage } from './noticeText';

describe('splitNoticeMessage', () => {
  it('separa el contexto del mensaje entre « »', () => {
    expect(splitNoticeMessage('Paginador de formularios · «Corregí el paginador, mirá el MR»')).toEqual({ lead: 'Paginador de formularios', message: 'Corregí el paginador, mirá el MR' });
  });
  it('un mensaje con comillas o con « » adentro se conserva entero', () => {
    expect(splitNoticeMessage('Ticket · «dijo «hola» y se fue»').message).toBe('dijo «hola» y se fue');
  });
  it('sin mensaje (o con una etiqueta que no va tras « · ») todo queda como contexto', () => {
    expect(splitNoticeMessage('Hilo del ticket · etiqueta «Estado: Testeado»')).toEqual({ lead: 'Hilo del ticket · etiqueta «Estado: Testeado»', message: null });
    expect(splitNoticeMessage('Solo el título del MR')).toEqual({ lead: 'Solo el título del MR', message: null });
  });
  it('el mensaje multilínea o vacío no rompe', () => {
    expect(splitNoticeMessage('T · «línea uno\nlínea dos»').message).toBe('línea uno\nlínea dos');
    expect(splitNoticeMessage('T · «(sin texto)»')).toEqual({ lead: 'T', message: '(sin texto)' });
  });
});
