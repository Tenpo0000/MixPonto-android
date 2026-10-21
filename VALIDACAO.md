# Validação da versão 1.1 — 19/10/2026

## Resultados confirmados

| Verificação | Resultado |
| --- | --- |
| Android `assembleDebug` após o último ajuste de persistência | `BUILD SUCCESSFUL` |
| Configuração Firebase compilada | `mixponto-ffe50`, `br.com.mixponto.app`, banco existente |
| SDK/Gradle/JDK Android | API 35 / Gradle 8.11.1 / JBR 21.0.11 |
| APK debug | 3.523.541 bytes |
| SHA-256 do APK | `E8FF8AFE592B3B272563AA01FAE76C86A86B83633C06798B9DA39C50E7A3C1AE` |
| Testes nos emuladores Authentication e Realtime Database | **36 aprovados, 0 falhas** |
| Emulador | Database 4.11.2, projeto fictício `demo-mixponto`, Java 21 |
| Runtime de testes efetivo | Node.js 24.14.1; dependências fixadas no lockfile |
| Firmware final | Compilação concluída para `esp32:esp32:esp32`, core 3.3.10 |
| Flash/RAM do firmware com configuração fictícia | 1.296.798 / 1.310.720 bytes; RAM global 52.504 / 327.680 bytes |
| Sintaxe JS e `git diff --check` no site | Aprovados; avisos de conversão LF/CRLF do Git não são falhas |
| Chamadas/biblioteca de Cloud Functions no app | Removidas; busca nos fontes/dependências declaradas não encontrou referências |

O firmware ocupa aproximadamente 99% da partição de aplicação padrão. A compilação passou, mas há pouca margem para futuras bibliotecas ou strings de configuração maiores. Verifique o tamanho ao compilar com sua configuração real; use um esquema de partições adequado à placa se necessário. Não foi alterada a partição do aparelho.

O JDK padrão do Android Studio instalado era 25 e falhou com este Gradle. A compilação funcionou ao selecionar o JBR 21 instalado. Não foi alterada a instalação global do Java. Permanecem avisos de APIs Android/Tasks depreciadas, sem erro de compilação.

## Cobertura dos 36 testes

- Autenticação, identidade vinculada ao e-mail do token e registro de identidade imutável; a confirmação de e-mail não é obrigatória para contas liberadas pelo titular.
- Vínculo por titular autorizado e recusa de autoautorização/autopromoção.
- Isolamento entre empresas e funcionários; recusa de cadastro privado e listagens globais.
- Batida/controle atômicos com horário do servidor.
- Recusa de adulteração de timestamp, origem, UID, campos extras e funcionário.
- Recusa de evento isolado, alteração isolada do controle e dois eventos no mesmo patch.
- Imutabilidade, reenvio e ausência de duplicação.
- Concorrência entre logins do mesmo funcionário e intervalo após RFID.
- Demissão, revogação, admissão futura e projeção de admissão desatualizada.
- Revogação sem apagar histórico.
- Leituras reais usadas pelo firmware e escrita/reenvio no caminho RFID original, com sessão titular.
- Fluxo integrado usando a função de vínculo do módulo do site: vínculo, `PATCH` REST móvel, confirmação `GET`, união de fontes e revogação. Nenhum funcionário adicional é criado.
- Protocolo condicional ETag do firmware: uma reserva com versão antiga recebe HTTP 412 após batida móvel; uma reserva válida bloqueia nova batida móvel.
- Horários UTC/UTC−3, mudança de dia em Brasília, datas inclusivas, um único par, separação por dia/funcionário e rejeição de admissão impossível.

Os testes importam a cópia do mesmo módulo de vínculo e normalização entregue em `site-integration`. O import do SDK via CDN é adaptado para o SDK local apenas no teste. As regras carregadas são exatamente `spark/database.rules.json`. O módulo de criação de credenciais também é importado do mesmo fonte entregue, com Auth/Database conectados aos emuladores locais.

## Limites da evidência

Não houve autenticação no Console, leitura dos dados reais ou das regras atualmente publicadas, publicação de regras/site/funções, criação de contas reais, envio de batidas reais, instalação do APK em aparelho ou gravação do ESP32. Os novos testes criaram usuários reais somente no emulador Authentication, com senhas fictícias; confirmaram login, ausência de exigência de verificação de e-mail e preservação da sessão titular. Não houve envio de e-mails reais.

A abertura da página local para inspeção visual foi recusada pelo controle de permissão do navegador. Não houve tentativa por outro navegador ou ferramenta para contornar a recusa. Portanto, não há evidência de layout renderizado ou teste de interface no navegador.

A compatibilidade demonstrada do RFID cobre compilação, caminhos/permissões, formato do contrato e concorrência de reserva no emulador. Não substitui leitura de cartão físico, reconexão do dispositivo ou teste de queda de energia real.

As regras anteriores e os módulos administrativos completos descritos no pedido não estavam disponíveis. O repositório indicado continha apenas um protótipo com dados e ações simulados. Não é possível afirmar preservação ou integração de relatórios, jornadas, faltas/atrasos, justificativas ou edição manual que não existem nessa cópia. Esses itens e a homologação real permanecem pendentes para o aceite integral.

Alterações já existentes em `package.json`, `package-lock.json` e `.vscode/` do repositório web foram preservadas. Não houve commit, push ou publicação.

## Atualização solicitada: credenciais definidas pelo administrador

- App 1.1, versionCode 2: login com os dados recebidos, sem criação de conta, código ou confirmação de e-mail na interface.
- Site: funcionário existente, e-mail, senha e confirmação; conta criada por sessão secundária com persistência em memória e vínculo autorizado pela sessão titular.
- Testes adicionais exercitam criação/login, batida sem e-mail verificado, ausência de senha no banco, limpeza da sessão temporária, repetição sem duplicação, conclusão de conta interrompida, senha incorreta de conta existente, validação antes de criar, bloqueio de autocadastro sem vínculo e isolamento entre empresas.
- As regras também impedem transformar um titular autorizado em login de funcionário de outra empresa.
- O firmware não foi alterado nesta atualização; sua compilação e os números de memória acima são da entrega anterior. O contrato RFID e as reservas continuam cobertos pelos testes de integração.
- Não houve publicação do site/regras nem instalação em aparelho nesta atualização. A inspeção visual anteriormente recusada não foi repetida.
