# AUTOCUT

Ferramenta Electron para preparação dimensional de artes para impressão por sublimação em tecidos.

## Regra dimensional principal

O AUTOCUT trabalha em pixels (ou em uma grade vetorial de alta precisão no caso de PDF) e nunca usa centímetros arredondados como fonte de verdade do corte.

O limite configurado do tecido se aplica ao **arquivo final**, portanto as margens entram no cálculo antes da divisão:

```text
área útil da faixa + margens aplicáveis <= limite físico do tecido
```

Não existe tolerância positiva que permita ultrapassar o limite.

## Distribuição das faixas

A opção `Distribuir faixas igualmente` fica **desmarcada por padrão**.

Sem margens no eixo limitado:

```text
Arte no eixo de corte: 280 cm
Máximo útil imprimível: 145 cm
Padrão: 145 + 135 cm
```

Somente quando o operador marca `Distribuir faixas igualmente`:

```text
280 cm -> 140 + 140 cm
```

Se o tecido tiver limite final de 145 cm e houver 1 cm de margem em cada lado do eixo limitado, o máximo útil da arte será aproximadamente 143 cm. A margem nunca pode transformar uma faixa válida em um arquivo final maior que o tecido.

## Implementado

- Pré-visualização da **arte real**, sem placeholder.
- Zoom, pan e linhas de corte arrastáveis.
- Modos de corte automático, horizontal e vertical.
- Modos de edição livre e vinculado/inteligente.
- Rotação de 90° considerada antes de decidir dividir a arte.
- Distribuição padrão pelo máximo útil imprimível e distribuição equilibrada somente por opção explícita.
- Tamanho mínimo desejável da última faixa como critério de aviso/escolha automática.
- Presets de tecidos editáveis, personalizados e persistentes.
- Margens por lado, tamanho, cor, opacidade e transparência.
- Identificações A1/A2, B1/B2, C1/C2... Z1/Z2, AA1/AA2 etc.
- Fonte, cor, tamanho físico e distância da borda para identificações.
- Nome da arte opcional nas margens.
- Template de nomenclatura com `{NOME}`, `{FAIXA}`, `{TOTAL_FAIXAS}`, `{FRACAO_FAIXA}`, `{TECIDO}`, `{LARGURA}`, `{ALTURA}`, `{TAMANHO}`, `{FORMATO}`, `{DPI}`, `{PEDIDO}` e `{DATA}`.
- Política de conflito: perguntar, versionar, substituir ou ignorar.
- Configurações persistentes com exportação, importação e restauração.
- Projetos `.autocut.json` com origem, página PDF, cortes, tecido, margens, identificação, nomenclatura, saída e reimpressão.
- Reimpressão de uma faixa específica usando exatamente os limites do projeto.
- Mapa de costura em JPEG com miniatura, ordem, medidas e emendas.
- Validação matemática de reconstrução sem lacuna e sem sobreposição.
- Trabalho sem divisão representado por uma faixa técnica 1/1 para preparação e validação sem corte artificial.

## Formatos raster

Entradas raster suportadas pelo engine Sharp incluem PNG, JPEG, TIFF, WebP e AVIF.

Saídas raster implementadas:

- PNG;
- JPEG, com qualidade configurável;
- TIFF, com LZW, Deflate ou sem compressão;
- WebP lossless;
- AVIF lossless.

Depois de salvar, cada arquivo é reaberto e validado quanto a dimensões, DPI, limite físico, espaço de cor, ICC, profundidade e alpha quando aplicável.

JPEG nunca recebe transparência silenciosamente: a interface avisa e a composição é feita sobre branco.

## PDF

PDF possui adapter próprio; não depende do Sharp para preservar vetor.

- PDF multipágina pode ser aberto e a página é selecionável na interface.
- O preview da página é renderizado somente para visualização.
- PDF -> PDF recorta a página por coordenadas físicas e preserva o conteúdo vetorial do original quando tecnicamente possível.
- Margens e identificações são desenhadas como elementos vetoriais no PDF.
- Raster -> PDF mantém os pixels originais sem redimensionamento e usa o DPI original para definir o tamanho físico.
- O PDF salvo é reaberto e validado por quantidade de páginas, dimensão física e limite do tecido.

PDF -> raster é deliberadamente bloqueado neste build para não inventar silenciosamente um DPI de rasterização.

## PSD / PSB

PSD e PSB usam um adapter Adobe Photoshop no Windows. Isso é intencional: o AUTOCUT não finge preservar layers usando uma biblioteca que achataria o documento.

Quando Adobe Photoshop e a automação COM estão disponíveis:

- PSD/PSB pode ser inspecionado sem alterar o original;
- é criada apenas uma miniatura temporária para o preview;
- o documento original é duplicado para cada faixa;
- o crop é feito sem redimensionar a arte;
- as margens são acrescentadas por `resizeCanvas`;
- A1/A2, B1/B2 etc. são criados como **camadas de texto editáveis**;
- PSD ou PSB é salvo com layers;
- o arquivo gerado é reaberto no Photoshop para validar largura, altura, DPI e presença de layers.

Sem Adobe Photoshop no Windows, PSD/PSB fica indisponível com mensagem explícita. Não há flatten silencioso.

## Arquitetura

A implementação não é monolítica. O processo principal apenas registra janela e IPC. A lógica está separada em módulos de:

- importação/inspeção;
- geometria e unidades;
- presets;
- algoritmo de corte;
- emendas;
- nomenclatura;
- raster export;
- PDF export;
- Photoshop PSD/PSB;
- validação;
- mapa de costura;
- projetos;
- configurações;
- política de arquivos de saída;
- renderer/interface.

A lógica geométrica permanece independente do Electron e pode ser testada diretamente.

## Segurança e validação

Regras invariáveis desta versão:

1. O arquivo final não pode ultrapassar o limite do tecido.
2. Margens entram no cálculo antes do corte.
3. A arte nunca é redimensionada para caber.
4. O DPI raster original é preservado; DPI ausente bloqueia o processamento até ser informado.
5. A rotação de 90° é considerada antes de dividir.
6. A soma das áreas úteis deve reconstruir exatamente o eixo original.
7. Não são criadas lacunas ou sobreposições acidentais.
8. As duas bordas da mesma emenda recebem o mesmo par A1/A2, B1/B2 etc.
9. O original nunca é sobrescrito pelo fluxo de corte.
10. A exportação é liberada somente quando a pré-validação está aprovada.
11. O resultado salvo passa por uma segunda validação independente conforme o engine.

## Testes

`npm test` executa testes do planner e adapters. Entre os cenários cobertos estão:

- Oxford 145 cm com arte que cabe sem corte;
- rotação antes da divisão;
- margem que torna 145 cm úteis inválidos;
- bloqueio de uma faixa 1 pixel acima do teto;
- modo vinculado adicionando/reposicionando limites válidos;
- reconstrução exata em pixels;
- A1/A2, B1/B2 e continuidade depois de Z;
- faixa técnica 1/1;
- **280 cm -> 145 + 135 cm por padrão**;
- **280 cm -> 140 + 140 cm somente com distribuição igual habilitada**;
- PDF multipágina, seleção de página e preview real;
- PDF vetorial 280 cm -> 145 + 135 cm;
- exportação PDF -> PDF e reabertura das faixas;
- verificação de que o teste PDF vetorial não converte o conteúdo em uma imagem raster.

O workflow de CI executa:

```text
npm ci
node --check em src/main, src/shared e src/renderer
npm test
npm run build
```

## Instalação

```bash
npm install
npm test
npm run build
npm start
```

Desenvolvimento no Windows:

```bash
npm run dev
```

Para PSD/PSB, Adobe Photoshop precisa estar instalado e acessível pela automação COM do Windows.
