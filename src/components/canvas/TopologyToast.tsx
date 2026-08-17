import React from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';

const toastStyle = css`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10050;
  padding: 8px 14px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
  max-width: 90%;
  text-align: center;
`;

export function TopologyToast({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  const toast = <div className={toastStyle}>{message}</div>;
  if (typeof document === 'undefined') {
    return toast;
  }
  return createPortal(toast, document.body);
}
