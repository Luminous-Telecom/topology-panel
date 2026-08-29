import React from 'react';

interface TrafficLabelProps {
  x: number;
  y: number;
  txLabel?: string;
  rxLabel?: string;
  uploadColor: string;
  downloadColor: string;
}

function LinkTrafficLabelComponent({
  x,
  y,
  txLabel,
  rxLabel,
  uploadColor,
  downloadColor,
}: TrafficLabelProps) {
  const valueFill = 'rgba(240,243,248,0.96)';
  const padX = 11;
  const charW = 6.55;
  const extra = (txLabel && rxLabel ? 3 : 0) + (txLabel ? 2 : 0) + (rxLabel ? 2 : 0);
  const chars = (txLabel?.length ?? 0) + (rxLabel?.length ?? 0) + extra;
  const width = chars * charW + padX * 2;
  const height = 22;
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={4}
        fill="rgba(15,17,22,0.95)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.7}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontWeight={600}
        letterSpacing={0.15}
      >
        {txLabel ? <tspan fill={uploadColor}>↑</tspan> : null}
        {txLabel ? <tspan fill={valueFill}> {txLabel}</tspan> : null}
        {txLabel && rxLabel ? <tspan fill="rgba(255,255,255,0.24)">  ·  </tspan> : null}
        {rxLabel ? <tspan fill={downloadColor}>↓</tspan> : null}
        {rxLabel ? <tspan fill={valueFill}> {rxLabel}</tspan> : null}
      </text>
    </g>
  );
}

export const LinkTrafficLabel = React.memo(LinkTrafficLabelComponent);
