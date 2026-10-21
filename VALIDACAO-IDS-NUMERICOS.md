# Validação — IDs numéricos automáticos

Entrega de 20/10/2026. O ID público da empresa é gerado automaticamente como 1, 2, 3… para todo o projeto Firebase. A lista, o formulário de empresa e o cabeçalho exibem o número; não há campo editável de ID. O app 1.3 já aceita esses números.

O módulo empresa-id.js grava sequenciaEmpresas, empresasPorId/{numero} e codigoApp do cadastro no mesmo lote. As regras validam incremento exato, vínculo ao cadastro, proprietário e imutabilidade do número existente. Se duas criações disputam um número, uma é recusada e o módulo repete após reler o contador. Reabrir/editar não consome número. Exclusões não reciclam IDs.

Empresas existentes recebem números ao atualizar como administrador, na ordem em que a migração é executada. Os IDs internos e as referências existentes não são alterados. Não houve execução dessa migração no banco de produção pelas ferramentas.

Verificação concluída: 69 testes locais do site e 57 testes nos emuladores Auth/Realtime Database, incluindo criações concorrentes em duas contas, duas abas na mesma empresa, rollback de lote incompleto, rejeição de salto/alteração/reutilização do número, edição e migração sem mover funcionários e transporte REST real.

Publique firebase/database.rules.json do site no projeto mixponto-ffe50 e recarregue o site como administrador. As regras são idênticas a spark/database.rules.json. Nenhuma regra foi publicada automaticamente. Nenhum teste visual de navegador ou teste físico em celular foi feito nesta entrega. O APK 1.3 foi preservado sem alterações.
