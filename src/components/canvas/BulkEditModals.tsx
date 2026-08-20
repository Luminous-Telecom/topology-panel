import React, { useMemo } from 'react';
import { BulkEditModalsState } from '../../hooks/useBulkEditModals';
import { TopologyHostIcon, TopologyMap } from '../../types';
import {
  BulkSubmapLayoutSize,
  updateHostsCredentialsBulk,
  updateHostsIconBulk,
  updateSubmapsBulk,
} from '../../utils/mapBulkEdits';
import { findNodeById } from '../../utils/topologyNodes';
import { BulkHostCredentialsModal, BulkHostIconModal, BulkSubmapEditModal } from '../lazyModals';

type SubmapPatch = Parameters<typeof updateSubmapsBulk>[2];
type HostCredentials = Parameters<typeof updateHostsCredentialsBulk>[2];

interface BulkEditModalsProps {
  storedMap: TopologyMap;
  nodeLayouts?: Map<string, BulkSubmapLayoutSize>;
  state: BulkEditModalsState;
  persist: (map: TopologyMap) => void;
  showToast: (message: string) => void;
}

/** Os três modais de edição em massa (ícone, credenciais e submapa), que compartilham o mesmo fluxo. */
export function BulkEditModals({ storedMap, nodeLayouts, state, persist, showToast }: BulkEditModalsProps) {
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

  const storedSubmapTargets = useMemo(
    () => submapTargets.map((node) => findNodeById(storedMap.nodes, node.id) ?? node),
    [storedMap.nodes, submapTargets]
  );

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
          key={storedSubmapTargets.map((n) => `${n.id}:${n.width ?? ''}:${n.height ?? ''}`).join('\0')}
          count={submapTargets.length}
          targets={storedSubmapTargets}
          nodeLayouts={nodeLayouts}
          onClose={() => {
            setSubmapOpen(false);
            setSubmapTargets([]);
          }}
          onSave={(patch: SubmapPatch) => {
            persist(updateSubmapsBulk(storedMap, storedSubmapTargets, patch));
            showToast(`Submapas atualizados (${submapTargets.length})`);
            setSubmapTargets([]);
          }}
        />
      )}
    </>
  );
}
