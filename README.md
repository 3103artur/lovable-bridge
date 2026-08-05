# Lovable Bridge

Repositório privado oficial do Lovable Bridge.

## Base atual

- Release geral: `R24`
- Extensão: `1.6.24.0`, ID oficial da Chrome Web Store
- Windows x64: extensão R24 + Companion R23
- macOS Intel e Apple Silicon: R22
- Atualizações preservam perfis, projetos, logins, configurações e alterações pendentes

## Estrutura

- `source/common/extension`: arquivos compartilhados da extensão.
- `source/windows`: overlays e Companion do Windows.
- `source/macos`: overlays e Companion do macOS.
- `scripts`: montagem e validação dos alvos.
- `history/release-notes`: histórico das atualizações.

## Segurança

Não versionar tokens, senhas, perfis, credenciais, projetos locais, logs pessoais ou instaladores.
