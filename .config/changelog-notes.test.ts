import { describe, expect, it } from 'vitest';
import { changelogNotesFor } from './changelog-notes.mjs';

const sample = `# Changelog

## [1.4.390] - 2026-08-30

### Adicionado

- Publica GitHub Release.

## [1.4.389] - 2026-08-30

### Corrigido

- Restaura trava do mapa.
`;

describe('changelogNotesFor', () => {
  it('devolve o corpo da versão, sem o heading, até a entrada seguinte', () => {
    expect(changelogNotesFor(sample, '1.4.390')).toBe('### Adicionado\n\n- Publica GitHub Release.');
  });

  it('devolve a última entrada até o fim do arquivo', () => {
    expect(changelogNotesFor(sample, '1.4.389')).toBe('### Corrigido\n\n- Restaura trava do mapa.');
  });

  it('devolve undefined quando a versão não existe', () => {
    expect(changelogNotesFor(sample, '9.9.9')).toBeUndefined();
  });
});
