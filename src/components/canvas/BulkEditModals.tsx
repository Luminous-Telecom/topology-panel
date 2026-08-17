import React from 'react';
import { TopologyHostIcon, TopologyMap, TopologyNode } from '../../types';
import {
  updateHostsCredentialsBulk,
  updateHostsIconBulk,
  updateSubmapsBulk,
} from '../../utils/mapEdits';
import { BulkHostCredentialsModal, BulkHostIconModal, BulkSubmapEditModal } from '../lazyModals';

type SubmapPatch = Parameters<typeof updateSubmapsBulk>[2];
type HostCredentials = Parameters<typeof updateHostsCredentialsBulk>[2];

interface BulkEditModalsProps {
  storedMap: TopologyMap;
  iconOpen: boolean;
  iconTargets: TopologyNode[];
  setIconOpen: (open: boolean) => void;
  setIconTargets: (targets: TopologyNode[]) => void;
  credsOpen: boolean;
  credsTargets: TopologyNode[];
  setCredsOpen: (open: boolean) => void;
  setCredsTargets: (targets: TopologyNode[]) => void;
  submapOpen: boolean;
  submapTargets: TopologyNode[];
  setSubmapOpen: (open: boolean) => void;
  setSubmapTargets: (targets: TopologyNode[]) => void;
  persist: (map: TopologyMap) => void;
  showToast: (message: string) => void;
}

/** Os três modais de edição em massa (ícone, credenciais e submapa), que compartilham o mesmo fluxo. */
export function BulkEditModals({
  storedMap,
  iconOpen,
  iconTargets,
  setIconOpen,
  setIconTargets,
  credsOpen,
  credsTargets,
  setCredsOpen,
  setCredsTargets,
  submapOpen,
  submapTargets,
  setSubmapOpen,
  setSubmapTargets,
  persist,
  showToast,
}: BulkEditModalsProps) {
  return (
    <>
      {iconOpen && iconTargets.length >= 1 && (
        <BulkHostIconModal
          count={iconTargets.length}
          onClose={() => {
            setIconOpen(false);
            setIconTargets([]);
          }}
          onSave={(icon: TopologyHostIcon) => {
            persist(updateHostsIconBulk(storedMap, iconTargets, icon));
            showToast(`Tipo aplicado a ${iconTargets.length} hosts`);
            setIconTargets([]);
          }}
        />
      )}

      {credsOpen && credsTargets.length >= 1 && (
        <BulkHostCredentialsModal
          count={credsTargets.length}
          onClose={() => {
            setCredsOpen(false);
            setCredsTargets([]);
          }}
          onSave={(creds: HostCredentials) => {
            persist(updateHostsCredentialsBulk(storedMap, credsTargets, creds));
            showToast(`Credenciais aplicadas a ${credsTargets.length} hosts`);
            setCredsTargets([]);
          }}
        />
      )}

      {submapOpen && submapTargets.length >= 1 && (
        <BulkSubmapEditModal
          count={submapTargets.length}
          onClose={() => {
            setSubmapOpen(false);
            setSubmapTargets([]);
          }}
          onSave={(patch: SubmapPatch) => {
            persist(updateSubmapsBulk(storedMap, submapTargets, patch));
            showToast(`Submapas atualizados (${submapTargets.length})`);
            setSubmapTargets([]);
          }}
        />
      )}
    </>
  );
}
