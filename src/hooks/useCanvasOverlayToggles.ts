import { useCallback, useEffect, useState } from 'react';

/**
 * Toggle de overlay com override local na sessão.
 *
 * O dashboard pode persistir a opção; enquanto o painel não está em modo edição, o clique na
 * toolbar só vale nesta sessão. Trocar a opção nas propriedades zera o override.
 *
 * `treatUndefinedAsTrue`: legenda e lista de alertas ligadas por omissão.
 * NOC começa desligado (`false`).
 */
function useSessionToggle(
  option: boolean | undefined,
  treatUndefinedAsTrue: boolean,
  onChange?: (next: boolean) => void
) {
  const [override, setOverride] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setOverride(undefined);
  }, [option]);

  const fallback = treatUndefinedAsTrue ? option !== false : Boolean(option);
  const effective = override ?? fallback;

  const toggle = useCallback(() => {
    const current = override ?? (treatUndefinedAsTrue ? option !== false : Boolean(option));
    const next = !current;
    setOverride(next);
    onChange?.(next);
  }, [onChange, option, override, treatUndefinedAsTrue]);

  return [effective, toggle] as const;
}

interface Params {
  showLegend?: boolean;
  showHostAlertList?: boolean;
  nocMode?: boolean;
  onShowLegendChange?: (show: boolean) => void;
  onShowHostAlertListChange?: (show: boolean) => void;
  onNocModeChange?: (enabled: boolean) => void;
}

/** Legenda, lista de alertas e modo NOC — persistidos quando dá, senão só na sessão. */
export function useCanvasOverlayToggles({
  showLegend: showLegendOption,
  showHostAlertList: showHostAlertListOption,
  nocMode,
  onShowLegendChange,
  onShowHostAlertListChange,
  onNocModeChange,
}: Params) {
  const [showLegend, handleToggleShowLegend] = useSessionToggle(showLegendOption, true, onShowLegendChange);
  const [showHostAlertList, handleToggleShowHostAlertList] = useSessionToggle(
    showHostAlertListOption,
    true,
    onShowHostAlertListChange
  );
  const [effectiveNocMode, handleToggleNocMode] = useSessionToggle(nocMode, false, onNocModeChange);

  return {
    showLegend,
    showHostAlertList,
    effectiveNocMode,
    handleToggleShowLegend,
    handleToggleShowHostAlertList,
    handleToggleNocMode,
  };
}
