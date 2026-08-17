import { TopologyLink, TopologyLinkMedium, TopologyNode } from '../types';

const RADIO_HOST_PATTERN = /LITEAP|WI2BE|LITE.?AP|PTMP|PTP|AIRFIBER|NANOBEAM|RADIO/i;

function nodeRadioHints(node?: TopologyNode): string {
  return [node?.zabbixHost?.trim(), node?.label?.trim()].filter(Boolean).join(' ');
}

/** Infer link medium from endpoint host names (LiteAP, Wi2BE, etc.). */
export function inferLinkMedium(from?: TopologyNode, to?: TopologyNode): TopologyLinkMedium {
  if (RADIO_HOST_PATTERN.test(nodeRadioHints(from)) || RADIO_HOST_PATTERN.test(nodeRadioHints(to))) {
    return 'radio';
  }
  return 'fiber';
}

export function resolveLinkMedium(link: TopologyLink): TopologyLinkMedium {
  return link.medium === 'radio' ? 'radio' : 'fiber';
}
