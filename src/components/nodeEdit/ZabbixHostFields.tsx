import React from 'react';
import { Field, Select } from '@grafana/ui';
import { FieldReadout } from '../FieldReadout';

const ipReadoutStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
};

interface Props {
  uid: string;
  options: Array<{ label: string; value: string; description?: string }>;
  hasQueryHosts: boolean;
  selectedHostKey?: string;
  displayIp?: string;
  displayDescription?: string;
  onSelect: (value?: string) => void;
}

export function ZabbixHostFields({
  uid,
  options,
  hasQueryHosts,
  selectedHostKey,
  displayIp,
  displayDescription,
  onSelect,
}: Props) {
  return (
    <>
      <Field
        label="Host Zabbix"
        description={
          hasQueryHosts
            ? 'Hosts dos grupos Zabbix configurados no painel.'
            : 'Nenhum host nos grupos configurados. Escolha o datasource e os grupos em Fonte de dados.'
        }
      >
        <Select
          inputId={`${uid}-host`}
          options={options}
          value={selectedHostKey}
          disabled={!hasQueryHosts}
          onChange={(v) => onSelect(v.value)}
          placeholder={options.length ? 'Selecione o host' : 'Nenhum host disponível nos grupos'}
        />
      </Field>
      {displayIp ? (
        <FieldReadout label="IP">
          <div style={ipReadoutStyle}>{displayIp}</div>
        </FieldReadout>
      ) : null}
      {displayDescription ? (
        <FieldReadout label="Descrição">
          <div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{displayDescription}</div>
        </FieldReadout>
      ) : null}
    </>
  );
}
