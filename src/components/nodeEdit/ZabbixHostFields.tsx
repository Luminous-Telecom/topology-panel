import React from 'react';
import { Field, Select } from '@grafana/ui';
import { FieldReadout } from '../FieldReadout';

const ipReadoutStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
};

interface Props {
  uid: string;
  options: Array<{ label: string; value: string }>;
  hasQueryHosts: boolean;
  selectedHostKey?: string;
  displayIp?: string;
  onSelect: (value?: string) => void;
}

export function ZabbixHostFields({
  uid,
  options,
  hasQueryHosts,
  selectedHostKey,
  displayIp,
  onSelect,
}: Props) {
  return (
    <>
      <Field
        label="Host Zabbix"
        description={
          hasQueryHosts
            ? 'Hosts retornados pela Query do painel. Vinculado pelo IP nos labels da série.'
            : 'Nenhum host na Query do painel. Configure a aba Query e aguarde os dados.'
        }
      >
        <Select
          inputId={`${uid}-host`}
          options={options}
          value={selectedHostKey}
          disabled={!hasQueryHosts}
          onChange={(v) => onSelect(v.value)}
          placeholder={options.length ? 'Selecione o host' : 'Nenhum host disponível na Query'}
        />
      </Field>
      {displayIp ? (
        <FieldReadout label="IP">
          <div style={ipReadoutStyle}>{displayIp}</div>
        </FieldReadout>
      ) : null}
    </>
  );
}
