import React from 'react';
import { createPortal } from 'react-dom';
import { overlayPortalRoot } from '../../utils/overlayPortal';
import styles from './TopologyToast.module.scss';

export function TopologyToast({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  const toast = <div className={styles.toast}>{message}</div>;
  if (typeof document === 'undefined') {
    return toast;
  }
  return createPortal(toast, overlayPortalRoot());
}
