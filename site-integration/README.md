# MixPonto — integração móvel com Firebase Spark

> Material histórico. O guia INSTALACAO-SPARK.md citado nesta entrega foi removido. Para a configuração atual de contas e permissões, consulte o [README principal](../README.md). As instruções antigas de titulares na raiz não descrevem a estrutura atual.

Esta cópia do site consulta o Realtime Database com o login titular, reúne batidas RFID e móveis no cartão, calcula horas pelos pares e imprime a tabela unificada pelo diálogo de impressão/PDF.

Acesso móvel: `/src/mobile.html`. O titular seleciona um funcionário já existente, define e-mail e senha e clica em **Criar e liberar acesso**. O funcionário entra no aplicativo com esses dados, sem código ou confirmação obrigatória de e-mail. A mesma tela lista e revoga vínculos sem apagar o histórico.

A criação usa uma sessão temporária em memória, mantendo o titular conectado. A senha é gerenciada pelo Firebase Authentication e não é salva no Realtime Database nem fica disponível na lista de acessos. Um e-mail já cadastrado exige sua senha atual; esta tela não redefine senhas desconhecidas. Repetir os mesmos dados permite concluir uma criação interrompida.

Sirva a raiz deste repositório por HTTP/HTTPS. A entrada do cartão é `/src/index.html`. As instâncias compartilhadas de Firebase Auth e Database estão em `fireBase_config.js`. O CSS permanece em `src/style.css`.

## Preparação do banco

Use as regras e o guia `INSTALACAO-SPARK.md` entregues com o projeto Android **1.1**. Atualize site, regras e APK em conjunto. O proprietário precisa cadastrar no Console a lista `titularesAutorizados/UID = true` e conferir `contas/UID/meta/ownerUid = UID`. Não libere o banco publicamente.

O firmware do terminal também precisa atualizar `controleBatidas` para aplicar cinco minutos entre fontes. Sem essa atualização, a gravação RFID antiga continua funcionando, mas não participa do intervalo compartilhado.

## Limitações verificadas

O commit inicial fornecido continha ações simuladas, sem cadastro de funcionários, jornadas, faltas/atrasos, justificativas persistidas ou edição manual. Esses módulos precisam ser recuperados da versão administrativa mencionada no pedido. A inclusão manual fica indisponível nesta cópia para evitar confirmação sem gravação e justificativas livres. Indicadores sem cálculo aparecem como não apurados.

As batidas anteriores à admissão não entram no total e recebem “Anterior ao cadastro”. O filtro inclui a data inicial e a final. Todas as batidas aparecem com origem e horário de Brasília, inclusive além do segundo par.

A integração não cria funcionários. Não houve publicação, batida real ou teste visual no navegador nesta sessão. Foram executados testes das regras e do vínculo/REST/união em emulador, documentados no pacote Android.
