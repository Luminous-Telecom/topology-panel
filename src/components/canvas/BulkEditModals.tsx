import React from 'react';
import { BulkEditModalsState } from '../../hooks/useBulkEditModals';
import { TopologyHostIcon, TopologyMap } from '../../types';
import { updateHostsCredentialsBulk, updateHostsIconBulk, updateSubmapsBulk } from '../../utils/mapBulkEdits';
import { BulkHostCredentialsModal, BulkHostIconModal, BulkSubmapEditModal } from '../lazyModals';

type SubmapPatch = Parameters<typeof updateSubmapsBulk>[2];
type HostCredentials = Parameters<typeof updateHostsCredentialsBulk>[2];

interface BulkEditModalsProps {
  storedMap: TopologyMap;
  state: BulkEditModalsState;
  persist: (map: TopologyMap) => void;
  showToast: (message: string) => void;
}

/** Os três modais de edição em massa (ícone, credenciais e submapa), que compartilham o mesmo fluxo. */
export function BulkEditModals({ storedMap, state, persist, showToast }: BulkEditModalsProps) {
  const {
    bulkIconEditOpen: iconOpen,
    bulkIconTargets: iconTargets,
    setBulkIconEditOpen: setIconOpen,
    setBulkIconTargets: setIconTargets,
    bulkCredsEditOpen: credsOpen,
    bulkCredsTargets: credsTargets,
    setBulkCredsEditOpen: setCredsOpen,
    setBulkCredsTargets: setCredsTargets,
    bulkSubmapEditOpen: submapOpen,
    bulkSubmapTargets: submapTargets,
    setBulkSubmapEditOpen: setSubmapOpen,
    setBulkSubmapTargets: setSubmapTargets,
  } = state;

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
