LOVABLE BRIDGE - BASE OFICIAL CONGELADA R22

OBJETIVO
Esta pasta e a fonte oficial da R22 confirmada pelo usuario como funcional.
Ela substitui a R21 como base principal de desenvolvimento, mas a R21 deve continuar guardada como ponto de restauracao.

IMPORTANTE
- Este pacote NAO e um instalador.
- Nao execute os arquivos da pasta platform para atualizar computadores.
- Nao substitua uma instalacao funcional usando esta pasta manualmente.
- Os ZIPs R22 ja testados continuam sendo os pacotes corretos para instalacao da R22.
- A pasta source e a referencia de codigo para as proximas versoes.

ORGANIZACAO DA FONTE
source/common/extension
Arquivos compartilhados pela extensao no Windows e no macOS.

source/windows
Arquivos R22 especificos do Windows: sidepanel.js e host.js.

source/macos
Arquivos R22 especificos do macOS: sidepanel.js e host.js.

POR QUE EXISTEM VARIANTES
Os nucleos sao equivalentes, mas alguns textos e contratos tecnicos identificam corretamente Windows ou macOS.
Manter overlays separados evita enviar instrucoes de Windows para o Mac e vice-versa.

SCRIPTS
- node scripts/validate-master.js
  Confere estrutura, JSON, sintaxe JavaScript e diferencas permitidas entre plataformas.

- node scripts/build-targets.js
  Monta copias completas em dist/windows e dist/macos a partir da fonte comum e dos overlays.
  A pasta dist e gerada e nao precisa ser versionada no GitHub.

STATUS
- R22 informada pelo usuario como testada e funcional antes do envio.
- R21 permanece como rollback seguro.
- Nenhum token, login ou perfil de usuario foi incluido nesta base.

PROXIMA ETAPA
Criar o repositorio privado oficial e enviar somente a fonte organizada, os scripts e a documentacao.
Pacotes ZIP de distribuicao deverao futuramente ficar em GitHub Releases, nao dentro do historico principal do repositorio.
