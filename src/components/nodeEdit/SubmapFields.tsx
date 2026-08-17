import React, { useMemo } from 'react';
import { Field, Select } from '@grafana/ui';
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
  childMapIds?: string[];
}

export function SubmapFields({ uid, values, set, queryRefInfos, childMapIds = [] }: Props) {
  const childMapOptions = useMemo(
    () => [
      { label: '— Nenhum —', value: '' },
      ...childMapIds.map((id) => ({ label: id, value: id })),
    ],
    [childMapIds]
  );

  return (
    <>
      <Field
        label="Mapa interno"
        description="Navega dentro do painel (prioridade sobre o dashboard externo)"
      >
        <Select
          inputId={`${uid}-submap-child-map`}
          value={values.submapChildMapId}
          options={childMapOptions}
          onChange={(opt) => set('submapChildMapId', opt?.value ?? '')}
        />
      </Field>
      <Field
        label="Dashboard externo"
        description={
          values.submapSlug
            ? `Slug: ${values.submapSlug}`
            : 'Usado quando não há mapa interno configurado'
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
