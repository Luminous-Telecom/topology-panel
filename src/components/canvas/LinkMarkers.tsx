import React from 'react';

interface Props {
  colorLink: string;
  colorLinkAttention: string;
  colorLinkHigh: string;
  colorLinkCongestion: string;
  colorOffline: string;
}

/** `<defs>` com as pontas dos links: anilha na origem e seta no destino. Tamanho em px. */
export function LinkMarkers({
  colorLink,
  colorLinkAttention,
  colorLinkHigh,
  colorLinkCongestion,
  colorOffline,
}: Props) {
  const arrow = (fill: string) => (
    <path d="M0.15,0.4 L7.35,3.5 L0.15,6.6 Z" fill={fill} />
  );
  /** Anilha do patch panel: aro na cor do cabo com miolo escuro. */
  const origin = (color: string, emphasized = false) => (
    <g>
      <circle cx="3.5" cy="3.5" r={emphasized ? 3.1 : 2.9} fill={color} />
      <circle cx="3.5" cy="3.5" r={emphasized ? 1.35 : 1.25} fill="#0d0f14" />
    </g>
  );

  const startMarker = (id: string, color: string, emphasized: boolean, size: number) => (
    <marker
      id={id}
      viewBox="0 0 7 7"
      refX="3.5"
      refY="3.5"
      markerWidth={size}
      markerHeight={size}
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      {origin(color, emphasized)}
    </marker>
  );

  const endMarker = (id: string, color: string, size: number) => (
    <marker
      id={id}
      viewBox="0 0 8 7"
      refX="7.2"
      refY="3.5"
      markerWidth={size}
      markerHeight={size * 0.88}
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      {arrow(color)}
    </marker>
  );

  const degradationMarkers = (
    level: 'attention' | 'high' | 'congested' | 'offline',
    color: string
  ) => (
    <>
      {startMarker(`link-dot-start-${level}`, color, true, 8)}
      {endMarker(`link-arrow-end-${level}`, color, 11)}
    </>
  );

  return (
    <defs>
      {startMarker('link-dot-start', colorLink, false, 7.5)}
      {endMarker('link-arrow-end', colorLink, 10.5)}
      {startMarker('link-dot-start-active', '#4FC3F7', true, 8.5)}
      {endMarker('link-arrow-end-active', '#4FC3F7', 11.5)}
      {startMarker('link-dot-start-hover', '#81D4FA', true, 8)}
      {endMarker('link-arrow-end-hover', '#81D4FA', 11)}
      {degradationMarkers('attention', colorLinkAttention)}
      {degradationMarkers('high', colorLinkHigh)}
      {degradationMarkers('congested', colorLinkCongestion)}
      {degradationMarkers('offline', colorOffline)}
    </defs>
  );
}
