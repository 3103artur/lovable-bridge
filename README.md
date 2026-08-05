# Lovable Bridge

Repositório privado oficial do Lovable Bridge.

## Base atual

- Código: `1.6.0`
- Release geral: `R23`
- Windows x64: `R23`, testada e aprovada
- macOS Intel e Apple Silicon: `R22`, preservada até nova validação
- Extensão: base R22 compatível; a correção R23 está no Companion do Windows
- Rollback preservado: `R22`

## Estrutura

- `source/common/extension`: arquivos compartilhados da extensão.
- `source/windows`: overlays e Companion do Windows.
- `source/macos`: overlays e Companion do macOS.
- `scripts`: montagem e validação dos alvos.
- `platform`: scripts de instalação e atualização mantidos como referência.
- `history/release-notes`: histórico das atualizações preservadas.

## Validação

Com Node.js 20 ou superior:

```bash
npm run validate
```

A validação confere a estrutura, os arquivos JSON, a sintaxe JavaScript e monta:

```text
dist/windows
dist/macos
```

A pasta `dist` é gerada localmente e não deve ser versionada.

## Segurança

Não enviar para este repositório:

- tokens ou senhas;
- arquivos `.env`;
- perfis de usuário;
- credenciais do GitHub;
- projetos locais de clientes;
- logs contendo dados pessoais;
- pacotes ZIP, EXE, MSI, DMG ou PKG.

Pacotes compilados e instaladores devem ser publicados como assets de **GitHub Releases**, e não no histórico principal do Git.
