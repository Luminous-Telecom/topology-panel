import React from 'react';
import { Field } from '@grafana/ui';
import { NodeEditFormSetter, NodeEditFormValues } from '../../hooks/useNodeEditForm';
import { TopologyQueryRefInfo } from '../../types';
import { DashboardPickerSelect } from '../DashboardPickerSelect';
import { QueryRefSelect } from '../QueryRefSelect';
import { NumberField } from './NumberField';

interface Props {
  uid: string;
  values: NodeEditFormValues;
  set: NodeEditFormSetter;
  queryRefInfos: TopologyQueryRefInfo[];
}

export function SubmapFields({ uid, values, set, queryRefInfos }: Props) {
  return (
    <>
      <Field
        label="Dashboard"
        description={
          values.submapSlug
            ? `Slug: ${values.submapSlug}`
            : 'Selecione o dashboard de destino do submapa'
        }
      >
        <DashboardPickerSelect
          inputId={`${uid}-submap-dashboard`}
          value={values.submapUid}
          onChange={(nextUid, slug) => {
            set('submapUid', nextUid);
            if (slug) {
              set('submapSlug', slug);
            }
          }}
        />
      </Field>
      <Field
        label="Consulta Zabbix"
        description="Consulta deste painel cujo host group define os hosts monitorados deste submapa"
      >
        <QueryRefSelect
          inputId={`${uid}-submap-query`}
          value={values.queryRefId}
          queryRefs={queryRefInfos}
          onChange={(value) => set('queryRefId', value)}
        />
      </Field>
      <NumberField
        id={`${uid}-submap-width`}
        label="Largura (px)"
        description="Vazio = automático pelo texto"
        value={values.width}
        placeholder="Automático"
        onChange={(value) => set('width', value)}
      />
      <NumberField
        id={`${uid}-submap-height`}
        label="Altura (px)"
        description="Vazio = automático pelo texto"
        value={values.height}
        placeholder="Automático"
        onChange={(value) => set('height', value)}
      />
    </>
  );
}
