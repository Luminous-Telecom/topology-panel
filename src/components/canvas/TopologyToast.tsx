import React from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { overlayCardStyle } from '../overlayChrome';
import { overlayPortalRoot } from '../../utils/overlayPortal';

const toastStyle = css`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10050;
  padding: 8px 14px;
  font-size: 12px;
  pointer-events: none;
  max-width: 90%;
  text-align: center;
`;

export function TopologyToast({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  const toast = <div className={`${overlayCardStyle} ${toastStyle}`}>{message}</div>;
  if (typeof document === 'undefined') {
    return toast;
  }
  return createPortal(toast, overlayPortalRoot());
}
