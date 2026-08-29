import React from 'react';

interface Props {
  colorLink: string;
  colorLinkAttention: string;
  colorLinkHigh: string;
  colorLinkCongestion: string;
  colorOffline: string;
}

/** `<defs>` com as pontas dos links: ponto luminoso na origem e no destino. Tamanho em px. */
export function LinkMarkers({
  colorLink,
  colorLinkAttention,
  colorLinkHigh,
  colorLinkCongestion,
  colorOffline,
}: Props) {
  /** Ponto na borda do host: halo + miolo na cor do cabo. */
  const portDot = (color: string, emphasized = false) => (
    <g>
      <circle cx="3.5" cy="3.5" r={emphasized ? 3.25 : 3.05} fill={color} opacity={0.4} />
      <circle cx="3.5" cy="3.5" r={emphasized ? 2.05 : 1.9} fill={color} />
    </g>
  );

  const dotMarker = (id: string, color: string, emphasized: boolean, size: number) => (
    <marker
      id={id}
      viewBox="0 0 7 7"
      refX="6.2"
      refY="3.5"
      markerWidth={size}
      markerHeight={size}
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      {portDot(color, emphasized)}
    </marker>
  );

  const degradationMarkers = (
    level: 'attention' | 'high' | 'congested' | 'offline',
    color: string
  ) => (
    <>
      {dotMarker(`link-dot-start-${level}`, color, true, 8)}
      {dotMarker(`link-dot-end-${level}`, color, true, 8)}
    </>
  );

  return (
    <defs>
      {dotMarker('link-dot-start', colorLink, false, 7.5)}
      {dotMarker('link-dot-end', colorLink, false, 7.5)}
      {dotMarker('link-dot-start-active', '#4FC3F7', true, 8.5)}
      {dotMarker('link-dot-end-active', '#4FC3F7', true, 8.5)}
      {dotMarker('link-dot-start-hover', '#81D4FA', true, 8)}
      {dotMarker('link-dot-end-hover', '#81D4FA', true, 8)}
      {degradationMarkers('attention', colorLinkAttention)}
      {degradationMarkers('high', colorLinkHigh)}
      {degradationMarkers('congested', colorLinkCongestion)}
      {degradationMarkers('offline', colorOffline)}
    </defs>
  );
}
