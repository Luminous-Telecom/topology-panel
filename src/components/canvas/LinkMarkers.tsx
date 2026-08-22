import React from 'react';

interface Props {
  colorLink: string;
  colorLinkAttention: string;
  colorLinkHigh: string;
  colorLinkCongestion: string;
}

/** `<defs>` com as pontas dos links: origem (bolinha) e destino (seta), nos estados normal/ativo/hover/degradação. */
export function LinkMarkers({
  colorLink,
  colorLinkAttention,
  colorLinkHigh,
  colorLinkCongestion,
}: Props) {
  const arrow = (stroke: string, sw = 1.2) => (
    <path
      d="M1,1 L7,4 L1,7"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  const origin = (stroke: string, filled = false, sw = 1) =>
    filled ? (
      <circle cx="3" cy="3" r="1.4" fill={stroke} />
    ) : (
      <circle cx="3" cy="3" r="1.5" fill="none" stroke={stroke} strokeWidth={sw} />
    );

  const degradationMarkers = (
    level: 'attention' | 'high' | 'congested',
    color: string
  ) => (
    <>
      <marker
        id={`link-dot-start-${level}`}
        viewBox="0 0 6 6"
        refX="3"
        refY="3"
        markerWidth="3.5"
        markerHeight="3.5"
        orient="auto"
      >
        {origin(color, true)}
      </marker>
      <marker
        id={`link-arrow-end-${level}`}
        viewBox="0 0 8 8"
        refX="6.5"
        refY="4"
        markerWidth="4"
        markerHeight="4"
        orient="auto"
      >
        {arrow(color, 1.3)}
      </marker>
    </>
  );

  return (
    <defs>
      <marker id="link-dot-start" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto">
        {origin(colorLink)}
      </marker>
      <marker id="link-arrow-end" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="4" markerHeight="4" orient="auto">
        {arrow(colorLink)}
      </marker>
      <marker
        id="link-dot-start-active"
        viewBox="0 0 6 6"
        refX="3"
        refY="3"
        markerWidth="4"
        markerHeight="4"
        orient="auto"
      >
        {origin('#4FC3F7', true)}
      </marker>
      <marker
        id="link-arrow-end-active"
        viewBox="0 0 8 8"
        refX="6.5"
        refY="4"
        markerWidth="4.5"
        markerHeight="4.5"
        orient="auto"
      >
        {arrow('#4FC3F7', 1.5)}
      </marker>
      <marker id="link-dot-start-hover" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto">
        {origin('#81D4FA', true)}
      </marker>
      <marker id="link-arrow-end-hover" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="4" markerHeight="4" orient="auto">
        {arrow('#81D4FA', 1.3)}
      </marker>
      {degradationMarkers('attention', colorLinkAttention)}
      {degradationMarkers('high', colorLinkHigh)}
      {degradationMarkers('congested', colorLinkCongestion)}
    </defs>
  );
}
