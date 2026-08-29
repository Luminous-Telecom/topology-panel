import React from 'react';
import { LINK_PILL_FILL, LINK_PILL_STROKE } from './linkLineVisual';

interface TrafficLabelProps {
  x: number;
  y: number;
  txLabel?: string;
  rxLabel?: string;
  uploadColor: string;
  downloadColor: string;
}

function pillLineWidth(value: string, padX: number, charW: number): number {
  return (value.length + 2) * charW + padX * 2;
}

const PILL_TEXT = {
  textAnchor: 'middle' as const,
  dominantBaseline: 'middle' as const,
  fontSize: 11,
  fontFamily: 'Inter, Helvetica, Arial, sans-serif',
  fontWeight: 600,
  letterSpacing: 0.15,
};

function LinkTrafficLabelComponent({
  x,
  y,
  txLabel,
  rxLabel,
  uploadColor,
  downloadColor,
}: TrafficLabelProps) {
  const valueFill = 'rgba(240,243,248,0.96)';
  const padX = 10;
  const charW = 6.45;
  const lineH = 14;
  const padY = 5;
  const both = Boolean(txLabel && rxLabel);
  const txWidth = txLabel ? pillLineWidth(txLabel, padX, charW) : 0;
  const rxWidth = rxLabel ? pillLineWidth(rxLabel, padX, charW) : 0;
  const width = Math.max(txWidth, rxWidth);
  const rows = (txLabel ? 1 : 0) + (rxLabel ? 1 : 0);
  const height = rows * lineH + padY * 2;
  let txY = 0;
  let rxY = 0;
  if (both) {
    txY = -lineH / 2;
    rxY = lineH / 2;
  }
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={8}
        fill={LINK_PILL_FILL}
        stroke={LINK_PILL_STROKE}
        strokeWidth={1}
      />
      {txLabel ? (
        <text x={0} y={txY} {...PILL_TEXT}>
          <tspan fill={uploadColor}>↑</tspan>
          <tspan fill={valueFill}> {txLabel}</tspan>
        </text>
      ) : null}
      {rxLabel ? (
        <text x={0} y={rxY} {...PILL_TEXT}>
          <tspan fill={downloadColor}>↓</tspan>
          <tspan fill={valueFill}> {rxLabel}</tspan>
        </text>
      ) : null}
    </g>
  );
}

export const LinkTrafficLabel = React.memo(LinkTrafficLabelComponent);
