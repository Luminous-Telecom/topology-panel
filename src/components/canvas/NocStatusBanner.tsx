import React from 'react';
import { css } from '@emotion/css';
import { NocMapSummary } from '../../utils/noc/topologyFilters';

const bannerStyle = css`
  position: absolute;
  bottom: 8px;
  left: 8px;
  z-index: 4;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
  pointer-events: none;
`;

interface Props {
  summary: NocMapSummary;
  problemsLoading?: boolean;
}

export function NocStatusBanner({ summary, problemsLoading }: Props) {
  return (
    <div className={bannerStyle} aria-live="polite">
      <strong>Modo NOC</strong>
      <span> · {summary.hostCount} hosts</span>
      {summary.offlineCount > 0 ? <span> · {summary.offlineCount} DOWN</span> : null}
      {summary.problemCount > 0 ? (
        <span>
          {' '}
          · {summary.problemCount} problema{summary.problemCount === 1 ? '' : 's'}
        </span>
      ) : problemsLoading ? (
        <span> · problemas…</span>
      ) : null}
      {summary.congestedLinkCount > 0 ? (
        <span> · {summary.congestedLinkCount} link(s) congestionado(s)</span>
      ) : null}
    </div>
  );
}
