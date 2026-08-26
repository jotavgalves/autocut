# AUTOCUT

Ferramenta Electron para preparação dimensional de artes para impressão por sublimação em tecidos.

## Estado desta versão

Esta versão substitui o protótipo inicial e corrige os problemas críticos de segurança dimensional e de pré-visualização.

### Implementado

- Pré-visualização da **imagem real** carregada, sem placeholder.
- Dimensões internas mantidas em **pixels como fonte de verdade**.
- Preservação do DPI informado pelo arquivo; quando o arquivo não possui DPI, a exportação fica bloqueada até o operador informar o valor real.
- Cálculo do limite do tecido incluindo as margens antes da divisão.
- Regra de rotação de 90° antes de decidir pelo corte.
- Cortes automático, horizontal e vertical.
- **Distribuição padrão pelo máximo útil imprimível**: cada faixa usa primeiro toda a medida útil possível e o restante fica para a última faixa.
- **Distribuição equilibrada opcional**: somente quando o operador marca `Distribuir faixas igualmente` o AUTOCUT redistribui as faixas, inclusive fazendo corte ao meio quando aplicável.
- Modos de edição livre e vinculado.
- Linhas de corte arrastáveis sobre a arte.
- Zoom e navegação na prévia.
- Margens configuráveis por lado, tamanho, cor e transparência.
- Identificações A1/A2, B1/B2, C1/C2... AA1/AA2 etc.
- Nome da arte opcional nas margens.
- Presets de tecidos editáveis e persistentes.
- Template de nomenclatura com prévia em tempo real.
- Projetos `.autocut.json` com parâmetros e posições de corte.
- Exportação raster para PNG, JPEG e TIFF.
- Política de conflito: versionar, substituir ou ignorar.
- Reabertura dos arquivos exportados para validação independente de dimensões, DPI, limite, espaço de cor, ICC, profundidade e alpha quando aplicável.
- Validação matemática de reconstrução sem lacuna ou sobreposição.
- Trabalho que não precisa de divisão representado por uma faixa técnica 1/1, permitindo preparar e validar uma cópia sem corte.
- **Modo de reimpressão**: gera somente a faixa escolhida a partir do original usando exatamente as posições, margens, emendas e nomenclatura do plano atual.
- **Mapa de costura em JPEG** com miniatura real da arte, linhas de corte, ordem das faixas, dimensões e pares de emenda.
- Estado de reimpressão e regra de distribuição salvos no projeto AUTOCUT.
- Testes automatizados do núcleo geométrico.

### Regra de distribuição automática

A opção de corte equilibrado fica **desmarcada por padrão**.

Exemplo sem margens no eixo limitado:

```text
Arte no eixo de corte: 280 cm
Máximo útil imprimível: 145 cm
Padrão: 145 + 135 cm
```

Somente com `Distribuir faixas igualmente` marcado:

```text
280 cm -> 140 + 140 cm
```

As margens continuam tendo prioridade sobre essa regra. Se o tecido tiver limite final de 145 cm e houver 1 cm de margem em cada lado do eixo limitado, o máximo útil da arte será aproximadamente 143 cm, pois o arquivo final jamais pode ultrapassar 145 cm.

### Ainda exige engine específico

Os itens abaixo não são marcados como prontos nesta versão porque precisam de um backend próprio para preservar as características exigidas:

- PSD/PSB com camadas e texto editável;
- PDF vetorial e PDF multipágina;
- preservação vetorial de texto nesses formatos;
- importação direta de PSD/PSB e seleção de páginas PDF.

A interface deixa PSD, PSB e PDF explicitamente indisponíveis em vez de converter silenciosamente para raster.

## Segurança dimensional

O limite físico é quantizado para pixels com o DPI real do trabalho e **não recebe tolerância positiva**. As margens são convertidas de forma conservadora e entram no cálculo antes da divisão.

Para cada faixa, a condição de liberação é:

```text
pixels úteis + margens aplicáveis <= limite do tecido em pixels
```

A soma das áreas úteis no eixo de corte deve reconstruir exatamente o tamanho original em pixels.

No modo de reimpressão, somente a faixa solicitada é gravada, mas a validação confirma primeiro que ela pertence a um plano completo cuja reconstrução continua válida.

## Instalação

```bash
npm install
npm test
npm run build
npm start
```

Para desenvolvimento no Windows:

```bash
npm run dev
```

## Testes cobertos

Os testes atuais incluem os casos críticos de Oxford 145 cm, margens que tornam 145 cm inválidos, bloqueio por 1 pixel acima do limite, modo vinculado, faixa técnica 1/1 para trabalhos sem divisão, reconstrução em pixels, continuidade das emendas após Z, distribuição padrão 145 + 135 para 280 cm e distribuição equilibrada 140 + 140 apenas quando explicitamente habilitada.
