import React, { useId } from 'react';
import { Button, Field, Input } from '@grafana/ui';
import { TopologyModal } from './TopologyModal';
import { modalHintStyle } from './chrome/overlayChrome';
import { HostMetadataMap, TopologyNode } from '../types';
import { resolveHostIp } from '../utils/hostLookup';
import { resolveHostDescription, resolveHostVisibleName } from '../utils/mapSync';
import styles from './HostInfoModal.module.scss';

interface Props {
  node: TopologyNode;
  hostMetadata?: HostMetadataMap;
  onClose: () => void;
}

function ReadOnlyField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <Field label={label}>
      <Input
        id={id}
        value={value}
        readOnly
        className={styles.input}
        onChange={() => undefined}
      />
    </Field>
  );
}

/** Ficha só leitura do host — nome, IP e descrição. Abre com duplo clique fora do modo editar. */
export function HostInfoModal({ node, hostMetadata, onClose }: Props) {
  const uid = useId();
  const name = resolveHostVisibleName(node, hostMetadata);
  const ip = resolveHostIp(node, hostMetadata);
  const description = resolveHostDescription(node, hostMetadata);
  const hasInfo = Boolean(name || ip || description);

  return (
    <TopologyModal title="Informações do host" onClose={onClose}>
      {name ? <ReadOnlyField id={`${uid}-name`} label="Nome" value={name} /> : null}
      {ip ? <ReadOnlyField id={`${uid}-ip`} label="IP" value={ip} /> : null}
      {description ? (
        <ReadOnlyField id={`${uid}-description`} label="Descrição" value={description} />
      ) : null}
      {!hasInfo ? <p className={modalHintStyle}>Sem nome, IP ou descrição neste host.</p> : null}
      <TopologyModal.ButtonRow>
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </TopologyModal.ButtonRow>
    </TopologyModal>
  );
}
