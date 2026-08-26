import React from 'react';

interface Props {
  colorLink: string;
  colorLinkAttention: string;
  colorLinkHigh: string;
  colorLinkCongestion: string;
  colorOffline: string;
}

/** `<defs>` com as pontas dos links: origem (conector) e destino (seta preenchida). */
export function LinkMarkers({
  colorLink,
  colorLinkAttention,
  colorLinkHigh,
  colorLinkCongestion,
  colorOffline,
}: Props) {
  const arrow = (fill: string) => (
    <path
      d="M1.2,1.15 L7.15,4 L1.2,6.85 Z"
      fill={fill}
      stroke={fill}
      strokeWidth={0.55}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
  const origin = (color: string, emphasized = false) => (
    <g>
      <circle cx="3" cy="3" r="2.2" fill="none" stroke={color} strokeWidth={emphasized ? 1.15 : 0.95} />
      <circle cx="3" cy="3" r={emphasized ? 1.05 : 0.72} fill={color} />
    </g>
  );

  const startMarker = (id: string, color: string, emphasized: boolean, size: number) => (
    <marker
      id={id}
      viewBox="0 0 6 6"
      refX="3"
      refY="3"
      markerWidth={size}
      markerHeight={size}
      orient="auto"
    >
      {origin(color, emphasized)}
    </marker>
  );

  const endMarker = (id: string, color: string, size: number) => (
    <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth={size} markerHeight={size} orient="auto">
      {arrow(color)}
    </marker>
  );

  const degradationMarkers = (
    level: 'attention' | 'high' | 'congested' | 'offline',
    color: string
  ) => (
    <>
      {startMarker(`link-dot-start-${level}`, color, true, 4)}
      {endMarker(`link-arrow-end-${level}`, color, 5)}
    </>
  );

  return (
    <defs>
      {startMarker('link-dot-start', colorLink, false, 4)}
      {endMarker('link-arrow-end', colorLink, 5)}
      {startMarker('link-dot-start-active', '#4FC3F7', true, 4.5)}
      {endMarker('link-arrow-end-active', '#4FC3F7', 5.5)}
      {startMarker('link-dot-start-hover', '#81D4FA', true, 4.2)}
      {endMarker('link-arrow-end-hover', '#81D4FA', 5.2)}
      {degradationMarkers('attention', colorLinkAttention)}
      {degradationMarkers('high', colorLinkHigh)}
      {degradationMarkers('congested', colorLinkCongestion)}
      {degradationMarkers('offline', colorOffline)}
    </defs>
  );
}
