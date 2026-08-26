# AUTOCUT

Ferramenta Electron para preparacao dimensional de artes para impressao por sublimacao em tecidos.

## Estado atual

- App Electron com renderer em canvas.
- Nucleo de calculo separado da interface.
- Presets iniciais: Oxford, Helanca e Tactel.
- Validacao dimensional com margens incluidas no limite fisico do tecido.
- Regra de rotacao: nao corta quando uma dimensao ja cabe no tecido.
- Emendas A1/A2, B1/B2, C1/C2.
- Testes automatizados dos principais cenarios de corte.

## Instalar

```bash
npm install
```

## Rodar

```bash
npm run build
npm start
```

Para desenvolvimento com Vite:

```bash
npm run dev
```

## Testar

```bash
npm test
```

Validar o arquivo de teste no Desktop:

```bash
npm run validate:desktop
```

Observacao: se o arquivo do Desktop estiver com 0 bytes, a validacao bloqueia corretamente porque nao ha imagem para decodificar.
