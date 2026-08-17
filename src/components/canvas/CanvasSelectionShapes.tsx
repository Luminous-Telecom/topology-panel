import React from 'react';
import { AlignGuideLine } from '../../utils/alignGuides';

interface Props {
  guides: AlignGuideLine[];
  marqueeRect: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** Feedback do gesto em andamento: guias de alinhamento e o laço de seleção. */
export function CanvasSelectionShapes({ guides, marqueeRect }: Props) {
  return (
    <>
      {guides.map((guide, i) => (
        <line
          key={`guide-${guide.orientation}-${guide.position}-${guide.kind}-${i}`}
          x1={guide.x1}
          y1={guide.y1}
          x2={guide.x2}
          y2={guide.y2}
          stroke={guide.kind === 'center' ? '#FF4081' : '#00E5FF'}
          strokeWidth={guide.kind === 'center' ? 1.5 : 1}
          strokeDasharray={guide.kind === 'center' ? undefined : '6 4'}
          strokeOpacity={0.95}
          pointerEvents="none"
        />
      ))}

      {marqueeRect && (
        <rect
          x={Math.min(marqueeRect.x0, marqueeRect.x1)}
          y={Math.min(marqueeRect.y0, marqueeRect.y1)}
          width={Math.abs(marqueeRect.x1 - marqueeRect.x0)}
          height={Math.abs(marqueeRect.y1 - marqueeRect.y0)}
          fill="rgba(79,195,247,0.12)"
          stroke="#4FC3F7"
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
    </>
  );
}
