# Contrato de Licença de Usuário Final (EULA)

**Software:** Topology Panel (`luminous-topology-panel`)  
**Licenciante:** Luminous Telecom  

Este Contrato de Licença de Usuário Final (“Contrato”) rege o uso do plugin Grafana Topology Panel e de toda documentação, arquivo de assinatura (`MANIFEST.txt`) e atualização fornecidos com ele (“Software”). Ao instalar, copiar ou usar o Software, a pessoa física ou jurídica que o recebe (“Licenciada”) aceita este Contrato. Se não concordar, não instale nem use o Software e devolva ou apague todas as cópias.

## 1. Concessão de licença

1.1. A Licenciante concede à Licenciada uma licença **não exclusiva**, **inestranferível**, **não sublicenciável** e **onerosa** (quando houver contraprestação pactuada) para instalar e usar o Software **somente**:

- no(s) servidor(es) Grafana cujo `root_url` (configuração `[server] root_url` do Grafana, coincidente com a URL usada no navegador) esteja listado no `MANIFEST.txt` assinado que acompanha o ZIP entregue; e
- para as finalidades internas da Licenciada (operação de mapas de topologia naquela instância).

1.2. Cada ZIP assinado corresponde à(s) URL(s) nele gravadas (nome de host ou endereço IP, com esquema e porta). Instância Grafana adicional, mudança de domínio, de IP, de esquema (`http`/`https`), de porta ou de caminho exige **novo ZIP assinado** e, se aplicável, nova licença.

1.3. A Licenciada pode fazer uma cópia de segurança do ZIP recebido, desde que permaneça sob seu controle e sujeita a este Contrato.

## 2. Restrições

É vedado à Licenciada, direta ou indiretamente:

- **revender, sublicenciar, alugar, emprestar, ceder, doar ou de outro modo redistribuir** o Software, o ZIP, o `MANIFEST.txt` ou chaves de assinatura;
- instalar o Software em Grafana cujo `root_url` **não** conste do `MANIFEST.txt` daquela entrega;
- remover, adulterar ou contornar a assinatura digital, o `MANIFEST.txt` ou mecanismos de verificação do Grafana;
- habilitar o Software como plugin não assinado (`allow_loading_unsigned_plugins` ou equivalente) **para fugir** à restrição de `root_url`;
- publicar o código-fonte, o bundle (`module.js`) ou o ZIP em repositório público ou marketplace sem autorização escrita da Licenciante;
- modificar o Software para mascarar a origem, a versão ou a assinatura;
- engenharia reversa, descompilação ou tentativa de extrair o código-fonte, **na medida em que a lei aplicável não assegure esse direito** (no Brasil, observe-se a Lei nº 9.609/1998 e normas correlatas);
- usar o Software para prestar serviço de topologia a terceiros (“SaaS” ou operação de NOC de cliente) sem licença específica por escrito.

## 3. Propriedade intelectual

3.1. O Software é protegido por direito autoral e demais normas de propriedade intelectual. A Licenciante (e seus licenciadores) **conservam todos os direitos** não concedidos expressamente neste Contrato. Não se transfere propriedade, apenas licença de uso.

3.2. Marcas, nomes e logotipos da Licenciante não são licenciados para uso comercial da Licenciada, salvo autorização escrita.

## 4. Entrega e assinatura

4.1. O Software é entregue como **plugin privado Grafana**: o ZIP contém `MANIFEST.txt` assinado para o(s) `root_url` informados pela Licenciada.

4.2. A Licenciada é responsável por informar o `root_url` **exato** da instância (incluindo esquema, host, porta e caminho). Divergência em relação ao `grafana.ini` / `GF_SERVER_ROOT_URL` impede o Grafana de carregar o plugin. Isso não gera direito a reembolso se o dado informado estiver incorreto, salvo pacto em contrário.

4.3. Atualizações (novas versões) podem ser fornecidas a critério da Licenciante e, em regra, exigem novo ZIP assinado para o mesmo `root_url`.

## 5. Dados e operação

O Software consulta o Grafana e fontes configuradas pela Licenciada (incluindo Zabbix). A Licenciante não acessa esses dados pelo mero fato da licença, salvo suporte contratado em que a Licenciada conceda acesso. Credenciais e mapas permanecem sob responsabilidade da Licenciada.

## 6. Ausência de garantia

O Software é fornecido **“como está”**, sem garantia de adequação a um fim específico, de funcionamento ininterrupto ou de ausência de erros, na extensão máxima permitida pela lei. A Licenciante não garante compatibilidade com versões futuras do Grafana ou do plugin grafana-zabbix.

## 7. Limitação de responsabilidade

Na extensão máxima permitida pela lei aplicável, a Licenciante não responde por lucros cessantes, perda de dados, indisponibilidade de rede ou danos indiretos. A responsabilidade total da Licenciante por este Contrato fica limitada ao valor efetivamente pago pela Licenciada à Licenciante pelo Software nos doze (12) meses anteriores ao evento, ou a um valor simbólico se a licença tiver sido gratuita. **Direitos do consumidor e normas de ordem pública** que não possam ser afastadas prevalecem sobre esta cláusula.

## 8. Vigência e rescisão

8.1. A licença vigora enquanto a Licenciada cumprir este Contrato e, se houver, o prazo ou a assinatura comercial pactuados.

8.2. A Licenciante pode rescindir o Contrato de pleno direito se a Licenciada violar a cláusula 2 ou redistribuir o Software. Na rescisão, a Licenciada deve desinstalar o plugin e apagar cópias, salvo obrigação legal de retenção.

8.3. As cláusulas de propriedade intelectual, restrições, garantia, responsabilidade e foro sobrevivem à rescisão.

## 9. Disposições gerais

9.1. Este Contrato constitui o acordo integral quanto ao Software e prevalece sobre comunicações anteriores sobre licenciamento, salvo contrato de fornecimento escrito que o incorpore ou o substitua.

9.2. A tolerância de um descumprimento não implica renúncia.

9.3. Se alguma cláusula for inválida, as demais permanecem.

9.4. A Licenciada não cede este Contrato sem consentimento escrito da Licenciante. A Licenciante pode ceder a sucessor de seu negócio.

9.5. Lei aplicável: **República Federativa do Brasil**. Foro: comarca da sede da Licenciante, com ressalva de foro privilegiado legal da Licenciada quando for consumidor pessoa física.

---

© Luminous Telecom. Todos os direitos reservados.
