# Lovable Bridge

Repositório privado oficial do Lovable Bridge.

## Base atual

- Código: `1.6.0`
- Release: `R22`
- Status: base confirmada como funcional
- Rollback preservado fora deste repositório: `R21`
- Alvos: Windows x64, macOS Intel e macOS Apple Silicon

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

Pacotes compilados e instaladores devem ser publicados futuramente como assets de **GitHub Releases**, e não no histórico principal do Git.
