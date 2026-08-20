import React from 'react';

interface GridBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Props {
  bounds: GridBounds;
  verticalLines: number[];
  horizontalLines: number[];
  isMajorLine: (value: number) => boolean;
  showGrid: boolean;
  /** Cursor de mão quando a ferramenta de pan está ativa. */
  grabCursor: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Fundo do mapa: o retângulo que captura cliques no vazio (pan, seleção por laço e menu de
 * contexto do canvas) e as linhas do grid.
 */
function CanvasGridLayerComponent({
  bounds,
  verticalLines,
  horizontalLines,
  isMajorLine,
  showGrid,
  grabCursor,
  onPointerDown,
  onContextMenu,
}: Props) {
  return (
    <>
      <rect
        x={bounds.x0}
        y={bounds.y0}
        width={bounds.x1 - bounds.x0}
        height={bounds.y1 - bounds.y0}
        fill="transparent"
        style={{ cursor: grabCursor ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
      />
      {showGrid && (
        <>
          {verticalLines.map((x) => (
            <line
              key={`gv-${x}`}
              x1={x}
              y1={bounds.y0}
              x2={x}
              y2={bounds.y1}
              stroke="#2a2a2e"
              strokeWidth={isMajorLine(x) ? 1.2 : 0.5}
              strokeOpacity={isMajorLine(x) ? 0.5 : 0.22}
              pointerEvents="none"
            />
          ))}
          {horizontalLines.map((y) => (
            <line
              key={`gh-${y}`}
              x1={bounds.x0}
              y1={y}
              x2={bounds.x1}
              y2={y}
              stroke="#2a2a2e"
              strokeWidth={isMajorLine(y) ? 1.2 : 0.5}
              strokeOpacity={isMajorLine(y) ? 0.5 : 0.22}
              pointerEvents="none"
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * A grade tem centenas de `<line>` e é redesenhada só quando os limites mudam.
 *
 * Os limites são arredondados para o passo da grade, então um pan curto não gera trabalho nenhum —
 * antes cada frame do gesto redesenhava a grade inteira.
 */
export const CanvasGridLayer = React.memo(CanvasGridLayerComponent);
