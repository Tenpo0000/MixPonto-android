> Versão atual: **1.5**. Veja CONTAS-1.5.md. O aplicativo usa ID da conta; empresas internas não recebem IDs próprios de login.

> A versão atual é **1.4**. O guia está em ISOLAMENTO-1.4.md; o serviço de descoberta está no projeto do site, em C:\Users\Laerte\Documents\GitHub\Sistema-de-ponto\servidor. O texto abaixo registra a entrega histórica 1.1.

# Instalação da adaptação Spark 1.1 — e-mail e senha pelo administrador — 19/10/2026

## Alcance e pendências

Esta entrega implementa o fluxo móvel sem Cloud Functions, vínculo/revogação pelo titular, regras testadas no emulador e união RFID/celular na cópia local do site. O APK usa `mixponto-ffe50` e o pacote `br.com.mixponto.app`.

Na versão 1.1, o titular define e-mail e senha pelo site. O funcionário só entra no aplicativo com esses dados. O fluxo anterior por código e confirmação obrigatória de e-mail foi substituído. **É necessário atualizar juntos o site, as regras e o APK; instalar apenas o novo APK não publica as permissões do banco.**

**Não publique as regras como uma substituição já homologada do ambiente atual.** Não foi possível recuperar as regras atualmente publicadas nem a versão completa do site descrita no pedido. Os testes usam as regras entregues e o contrato do firmware encontrado, com dados fictícios. Antes da implantação, compare as regras atuais, preserve quaisquer outros caminhos necessários e faça o teste físico descrito ao final.

O repositório informado (`C:\Users\Laerte\Documents\GitHub\Sistema-de-ponto`, commit inicial `9e02c10`) só continha `src/index.html`, `src/script.js` e `src/style.css`, sem login/cadastros. Os botões de inclusão/ajuste e o PDF apenas simulavam sucesso. Não havia implementação de jornadas, justificativas cadastradas, edição/exclusão manual, faltas ou atrasos a preservar. Os módulos de cadastro/relatórios citados no pedido ainda precisam ser recuperados e integrados. A adaptação não cria funcionários.

## 1. Preparar os titulares existentes no Console

Faça uma exportação dos dados e guarde as regras atuais antes de alterar produção. No Firebase Console do projeto correto, use o Realtime Database existente:

`https://mixponto-ffe50-default-rtdb.firebaseio.com`

Para **cada titular já autorizado**, cadastre manualmente estes valores sem substituir a raiz do banco:

```text
titularesAutorizados/UID_TITULAR = true
contas/UID_TITULAR/meta/ownerUid = "UID_TITULAR"
```

Use o UID real de Authentication, igual ao configurado no terminal. Confirme que `contas/UID_TITULAR/funcionarios` e os registros pertencem àquela conta. A lista de titulares só pode ser mantida por quem tem permissão no Console/Admin, nunca pelo aplicativo ou site. Nenhuma conta de funcionário recebe entrada nessa lista.

Isso é obrigatório: sem uma lista de titulares confiável, uma conta poderia fabricar seus próprios metadados e se declarar administradora. As regras entregues bloqueiam esse comportamento. Cadastros de novas empresas também exigem esse provisionamento explícito; não há promoção automática pelo site.

Confirme Authentication → provedores → E-mail/senha. O funcionário usa uma conta individual. Se App Check estiver com exigência ativada no Realtime Database, é necessário integrar seus tokens ao app/terminal antes da implantação; essa exigência não foi inspecionada ou desativada nesta sessão.

## 2. Instalar o site

Os arquivos já foram alterados no repositório indicado. No pacote, a pasta `site-integration` contém estes mesmos caminhos:

| Caminho a substituir/adicionar | Função |
| --- | --- |
| `fireBase_config.js` | Instância compartilhada de Auth/Database |
| `src/index.html` | Link de acesso móvel e intervalo inclusivo de datas |
| `src/script.js` | Consulta autenticada, união de fontes, totais e impressão |
| `src/style.css` | Estilos centralizados, incluindo os antigos estilos dos modais |
| `src/mobile.html` | Login titular e tela de vínculo |
| `src/pages/mobile.js` | Seleção, consulta e revogação |
| `src/core/mobile-access.js` | Vínculo e inicialização do controle de intervalo |
| `src/core/employee-credentials.js` | Criação das credenciais em sessão temporária isolada |
| `src/core/batidas.mjs` | Normalização e cálculo compartilhado |

Mantenha `fireBase_config.js` na raiz e a pasta `src` abaixo dela. Sirva a raiz por HTTP/HTTPS; não abra por `file://`. A entrada principal é `/src/index.html` e a administração móvel é `/src/mobile.html`. O ambiente publicado precisa ter o domínio permitido na configuração de Authentication.

Para conferir localmente, a partir da pasta Android:

```powershell
node spark/serve-site.mjs "C:\Users\Laerte\Documents\GitHub\Sistema-de-ponto"
```

Abra `http://127.0.0.1:8085/src/mobile.html`. A aplicação web usa o SDK Firebase via CDN; não precisa de um servidor de funções.

Se o site em produção for a versão completa com `pages/*.js` e `core/*.js` mencionada no pedido, **não o substitua pela interface antiga deste pacote**. Integre o módulo de vínculo à tela Cadastro → Funcionário e use `mergeRecords` como fonte de todos os consumidores de batidas. Relatórios, PDF, faltas/atrasos e totais devem receber essa mesma coleção. Essa integração com os módulos ausentes permanece pendente.

## 3. Atualizar o RFID antes de liberar o celular

Foi inspecionado `C:\Users\Laerte\Desktop\PontoESP32\PontoESP32.ino`. Ele usa `FirebaseESP32.h`, login/senha **do titular**, consulta cartão/cadastro e grava:

```text
contas/UID_TITULAR/cartoes/UID_CARTAO = FUNCIONARIO_ID
contas/UID_TITULAR/funcionarios/FUNCIONARIO_ID/{cartaoUid,nome,status,admissao}
contas/UID_TITULAR/registros/AAAA-MM-DD/FUNCIONARIO_ID/esp_ID
```

O firmware encontrado produz `timestamp` UTC ISO com `Z`; o dia do caminho usa Brasília (`BRT3`). Ele mantém uma batida pendente em flash e só mostra sucesso após a gravação. A proteção anterior de leitura repetida era de 10 segundos no terminal, não o intervalo móvel de 5 minutos.

O firmware atualizado mantém os caminhos, o formato do registro, o leitor RC522 e o LCD. Acrescenta consulta à admissão e controle de cinco minutos em `controleBatidas/FUNCIONARIO_ID`, usando reserva condicional por ETag para não sobrescrever uma batida concorrente. Uma leitura recusada por intervalo não gera batida. A reserva pode permanecer após uma queda; o mesmo terminal deve concluir o envio pendente. Uma reserva não concluída pode bloquear novas batidas por até cinco minutos.

Procedimento:

1. Resolva qualquer batida pendente do firmware antigo antes da atualização.
2. Copie `firmware/PontoESP32/config.example.h` para `config.h` nessa mesma pasta.
3. Preencha Wi-Fi, API key web, e-mail/senha do titular e seu UID. O arquivo original com credenciais foi preservado fora deste pacote.
4. Abra `firmware/PontoESP32/PontoESP32.ino` no Arduino IDE.
5. Use ESP32 clássico, biblioteca Mobizt `Firebase ESP32 Client` (`FirebaseESP32.h`), MFRC522 e LiquidCrystal_I2C.
6. Compile e grave pelo procedimento normal do seu dispositivo. Não foi feito upload para hardware nesta sessão.

Compilação validada: `esp32:esp32:esp32`, core ESP32 3.3.10. Use o fonte com suas configurações; o pacote não distribui um binário configurado com suas senhas.

**O firmware antigo continua autorizado a gravar RFID com as novas regras, se o titular estiver na lista. Porém, ele não atualiza o controle compartilhado. O intervalo entre fontes só deve ser considerado integrado após atualizar todos os terminais.** O titular é uma identidade administrativa confiável, com as mesmas permissões amplas já usadas pelo terminal; não se trata de uma conta de dispositivo com privilégios restritos.

## 4. Publicar somente as regras

Depois de comparar as regras atuais, preparar os titulares e conferir as dependências dos demais módulos, na pasta `spark`:

```powershell
npm ci
npx firebase-tools login
npx firebase-tools deploy --only database --project mixponto-ffe50
```

Alternativamente, copie **somente** o conteúdo de `spark/database.rules.json` na aba Regras do Realtime Database e publique. Não importe esse JSON como dados.

O `firebase.json` entregue contém configuração de Database/emulador, sem Functions ou Hosting. O comando acima não publica app, firmware ou site. Nenhuma publicação foi feita nesta sessão. A cópia das antigas funções foi retirada do fluxo e guardada localmente em `historico/functions-anteriores.zip`; não faz parte do pacote Spark. Se versões antigas de funções já estiverem publicadas no projeto, retire seus endpoints antes da homologação: o Admin SDK dessas funções pode ignorar regras. Não houve confirmação de funções publicadas.

## 5. Criar o acesso e entrar no aplicativo

1. Instale `apk/MixPonto-spark-1.1-debug.apk` em um aparelho de teste Android 8/API 26 ou superior. O versionCode foi incrementado para 2.
2. Se já havia uma versão dependente das funções, resolva seus envios pendentes antes de atualizar. A fila antiga das funções não foi migrada automaticamente. A fila REST da versão Spark 1.0 mantém o mesmo formato nesta atualização.
3. No site atualizado, entre como titular em Acesso pelo celular (`/src/mobile.html`).
4. Selecione o funcionário **já cadastrado**, ativo e com admissão válida.
5. Informe um e-mail individual diferente do administrador, defina uma senha com pelo menos 8 caracteres e repita a senha no campo de confirmação.
6. Clique em **Criar e liberar acesso** e aguarde a confirmação. O vínculo inicializa o controle a partir das batidas conhecidas sem recuar um controle mais recente do terminal.
7. Entregue ao funcionário o e-mail e a senha que você definiu. A senha é a do aplicativo, não a senha da caixa de e-mail.
8. No aplicativo, o funcionário informa esses dados e toca em Entrar. Não precisa criar conta, enviar código ou confirmar e-mail para bater ponto.
9. Confira nome e matrícula, registre o ponto e aguarde Ponto registrado. Confira a batida no cartão do site.

A conta nova do Authentication não cria outro cadastro de funcionário. O vínculo depende da sessão titular autorizada nas regras. Uma conta criada diretamente fora desse fluxo continua sem acesso ao ponto.

O site usa uma instância temporária do Firebase Auth com persistência apenas em memória para criar o login; a sessão titular permanece aberta. Uma identidade própria registra o e-mail do token no banco, e a sessão administrativa confirma o vínculo. Senhas não são armazenadas no banco, em listas de acessos, logs ou armazenamento local do site. Os campos de senha são limpos após cada tentativa.

Se uma criação for interrompida, tente novamente com o **mesmo e-mail e senha**. Caso o e-mail já exista, o site só continua se esses dados autenticarem a conta existente. Ele não redefine uma senha desconhecida nem toma um vínculo ativo de outra empresa. O titular pode revogar o acesso pela lista; os históricos são mantidos. Para recuperar uma senha esquecida, use a recuperação por e-mail do aplicativo. Use um e-mail real ao qual o funcionário tenha acesso se quiser utilizar essa recuperação.

O APK debug compilado aponta para o projeto informado; não é um APK fictício. É destinado à validação. Para distribuição, gere um APK/App Bundle release assinado com sua chave. A chave debug usada no ambiente não é sua chave de distribuição.

## 6. Contrato dos dados e regras

```text
titularesAutorizados/UID = true                     # Console/Admin apenas
solicitacoesMobile/UID = { email, criadoEm }         # Identidade do próprio login; sem senha
acessosMobile/UID = { empresaUid, funcionarioId, ativo, vinculadoEm }
contas/EMPRESA/mobileAcessos/UID = { funcionarioId, email, ativo }
contas/EMPRESA/mobileConfig/FUNCIONARIO = { admissao, admissaoEm, empresa }
contas/EMPRESA/batidasMobile/FUNCIONARIO/UUID = { timestamp, authUid, origem: "android" }
contas/EMPRESA/controleBatidas/FUNCIONARIO = { timestamp, requestId, authUid, origem }
```

`timestamp` móvel é número em milissegundos, enviado com `{ ".sv": "timestamp" }`. As regras exigem igualdade ao `now` do servidor e conferem, na mesma atualização, a batida e o controle. O intervalo usa esse controle por funcionário, inclusive quando dois logins usam o mesmo cadastro. Não há edição ou exclusão de batidas pelo funcionário, nem gravação móvel no caminho RFID.

O app usa REST autenticado com o ID token do Firebase. Não instala SDK administrativo, não consulta a conta inteira e não usa uma fila offline do SDK Database. O histórico RFID é lido por dia/funcionário; o móvel usa consulta indexada por timestamp. Cadastro privado, fotos, CPF, outros funcionários e outras empresas não são liberados.

O vínculo titular agora substitui a exigência de `email_verified` para o registro de ponto. A identidade só pode gravar o próprio e-mail presente no token; isso, isoladamente, não concede acesso. Somente um titular da lista confiável pode liberar o vínculo. Contas da própria lista de titulares não podem ser usadas como login de funcionário. Essa mudança nas regras é necessária para o fluxo de entrada imediata solicitado.

O UUID pendente fica salvo por login junto com empresa/funcionário. Falha de rede conserva a mesma tentativa. Uma repetição primeiro consulta o comprovante, e uma segunda escrita na mesma chave é negada pelo banco. A UI só mostra sucesso após ler o registro confirmado no servidor. Não há batida móvel retroativa offline. Se o vínculo mudar com envio pendente, o app exige conferência/restauração do vínculo anterior para não atribuir o pedido à pessoa errada.

Revogação (`ativo: false`) impede novas batidas e preserva o histórico. `status` diferente de `ativo` bloqueia ponto. A admissão precisa corresponder à projeção autorizada e seu início precisa ter ocorrido no servidor. Se a admissão mudar no cadastro, confirme o vínculo novamente para sincronizar a projeção. Isso falha de forma restritiva até a sincronização.

Em uma futura integração com a tela manual completa, toda gravação administrativa de uma batida recente também deve atualizar `controleBatidas` sem recuar seu timestamp, por transação. Esse módulo não existe no fonte fornecido. Mantenha as restrições anteriores à admissão e a edição/exclusão apenas para registros `manual: true`; não aplique essas ações aos registros móveis.

## 7. Datas, relatórios e limites

`mergeRecords` normaliza números, ISO UTC e timestamps antigos sem sufixo (tratados explicitamente como UTC−3). Ordena as duas fontes e inclui ambas as datas do filtro. O cálculo agrupa por funcionário/dia e aceita um único par. Um número ímpar deixa a última entrada sem duração; não inventa saída.

**Não foi obtida uma amostra dos dados históricos reais.** A interpretação UTC−3 de valores antigos sem fuso corresponde ao contexto fornecido e ao contrato local anterior; confirme amostras reais antes de converter ou migrar dados. Nenhum histórico foi regravado.

A impressão/PDF da interface recebida agora usa a tabela unificada pelo diálogo de impressão do navegador. Relatórios avançados, saldo de banco e faltas/atrasos continuam sem implementação nessa cópia antiga. Indicadores sem implementação aparecem como não apurados, e a inclusão manual está indisponível nesta cópia para evitar uma confirmação sem gravação. A versão administrativa completa precisa ser recuperada.

O site atualmente acompanha coleções da conta titular. Isso mantém simplicidade e compatibilidade com o pequeno fonte disponível, mas ainda não implementa paginação de uma base grande. O plano Spark continua sujeito às suas cotas de armazenamento, tráfego e conexões; esta arquitetura não remove essas cotas. Consulte os [limites oficiais](https://firebase.google.com/docs/database/usage/limits).

## 8. Validação e aceite em produção

Resultados executados nesta sessão estão em `VALIDACAO.md`. Para repetir localmente, Java 21 no PATH e Node.js 22 recomendado:

```powershell
cd spark
npm ci
npm test
```

O comando usa `demo-mixponto`; não escreve em produção. As tentativas negadas nos testes geram avisos `permission_denied` esperados.

Antes do aceite final, no ambiente real:

- Confirme as regras atuais e os módulos administrativos ausentes.
- No site, crie e libere o e-mail/senha de um funcionário de teste, entre no app com esses dados e registre pelo aparelho.
- Confira o registro, os totais e a impressão no site.
- Leia um cartão físico e confira nome, caminho, data e sincronização do controle.
- Teste os dois sentidos do intervalo de cinco minutos, rede interrompida durante envio e confirmação após reiniciar o app/terminal.
- Revogue e desligue o funcionário de teste; confirme a recusa sem perda do histórico.
- Confira edição/exclusão manual, justificativas cadastradas e relatórios ao recuperar os módulos originais.

Não foi feita homologação em aparelho, terminal físico ou banco real. Não considere o objetivo integral concluído antes desses passos.

Referências técnicas: [escrita REST e ETags](https://firebase.google.com/docs/database/rest/save-data), [condições e validação nas regras](https://firebase.google.com/docs/database/security/rules-conditions), [relógio do servidor](https://firebase.google.com/docs/reference/security/database#now).

Criação das credenciais e persistência da sessão: [Authentication com e-mail/senha](https://firebase.google.com/docs/auth/web/password-auth), [initializeAuth e inMemoryPersistence](https://firebase.google.com/docs/reference/js/auth#initializeauth).
