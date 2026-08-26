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
- Testes automatizados do núcleo geométrico.

### Ainda exige engine específico

Os itens abaixo não são marcados como prontos nesta versão porque precisam de um backend próprio para preservar as características exigidas:

- PSD/PSB com camadas e texto editável;
- PDF vetorial e PDF multipágina;
- preservação vetorial de texto nesses formatos;
- mapa de costura final em formato de produção;
- fluxo dedicado de reimpressão de uma única faixa;
- importação direta de PSD/PSB e seleção de páginas PDF.

A interface deixa PSD, PSB e PDF explicitamente indisponíveis em vez de converter silenciosamente para raster.

## Segurança dimensional

O limite físico é quantizado para pixels com o DPI real do trabalho e **não recebe tolerância positiva**. As margens são convertidas de forma conservadora e entram no cálculo antes da divisão.

Para cada faixa, a condição de liberação é:

```text
pixels úteis + margens aplicáveis <= limite do tecido em pixels
```

A soma das áreas úteis no eixo de corte deve reconstruir exatamente o tamanho original em pixels.

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

Os testes atuais incluem os casos críticos de Oxford 145 cm, margens que tornam 145 cm inválidos, bloqueio por 1 pixel acima do limite, modo vinculado, reconstrução em pixels e continuidade das emendas após Z.
