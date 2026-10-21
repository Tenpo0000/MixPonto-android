# MixPonto Android

Aplicativo Android para funcionários registrarem e consultarem suas batidas de ponto, integrado ao sistema web MixPonto e ao Firebase.

**Versão atual:** 1.7.1 · **Código:** 8 · **Android mínimo:** 8.0 (API 26).

O funcionário utiliza o ID numérico da conta, seu e-mail e sua senha. O administrador configura e pode revogar esse vínculo pelo cadastro do funcionário no sistema web.

> Projeto em desenvolvimento. Não declara certificação como registrador eletrônico de ponto, conformidade jurídica integral ou auditoria completa de acessibilidade. O APK debug é destinado à validação.

## Funcionalidades

- Autenticação individual com e-mail e senha pelo Firebase Authentication.
- Seleção da conta pelo ID numérico exibido no cabeçalho do site.
- Verificação do vínculo, situação do funcionário e data de admissão.
- Registro de ponto com horário confirmado pelo servidor.
- Consulta das batidas do dia.
- Controle de tentativas pendentes para conferir envios após falhas de rede.
- Políticas e termos disponíveis localmente, inclusive antes do login.
- Solicitações de privacidade e acessibilidade, com consulta de protocolos e respostas.
- Controles nativos, rótulos associados aos campos e texto ajustável pelo sistema.

## Tecnologias

| Componente | Implementação |
| --- | --- |
| Aplicativo | Kotlin e componentes nativos Android |
| Autenticação | Firebase Authentication |
| Dados | Firebase Realtime Database via REST/HTTPS |
| Compilação | Gradle Wrapper 8.11.1 |
| SDK Android | Compilação e destino API 35; mínimo API 26 |
| Testes de integração | Node.js e emuladores Firebase Authentication/Database |

O fluxo atual acessa o Firebase diretamente e não depende de Cloud Functions. O serviço de descoberta e gestão de contas pertence ao [projeto do site](https://github.com/Tenpo0000/Sistema-de-ponto); não é necessário incluir credenciais administrativas no aplicativo.

## Como usar

### Administrador no site

1. Entre no sistema web e selecione a conta correta.
2. Abra **Cadastro → Funcionário** e selecione um funcionário ativo.
3. Informe o e-mail individual, a senha e a confirmação; salve o cadastro.
4. Entregue ao funcionário as credenciais e o **ID numérico da conta**, exibido no cabeçalho.

O cadastro conserva o e-mail. A senha não é mantida em cópia recuperável no Realtime Database. Para manter um acesso existente ao editar o cadastro, deixe senha e confirmação vazias.

### Funcionário no aplicativo

1. Informe o ID da conta, e-mail e senha recebidos.
2. Entre e aguarde a conferência do vínculo.
3. Registre o ponto e aguarde a confirmação do servidor.
4. Consulte as batidas para conferir o registro.

O ID da conta não é o UID do usuário nem o ID de uma empresa/unidade cadastrada dentro da conta. Conhecer esse número não concede acesso aos dados.

O login mobile não exige confirmação de e-mail do funcionário no fluxo atual; depende de um vínculo individual liberado pelo administrador. Usuários compartilhados do sistema web seguem as regras próprias de confirmação de e-mail.

## Confirmação de batidas e conexão

O app grava a batida móvel e o controle de intervalo juntos. O horário vem do servidor, e as regras conferem a autorização e o intervalo mínimo, atualmente de **cinco minutos**.

Antes do envio, o aplicativo guarda um identificador da tentativa, associado à conta, usuário e funcionário. Se a conexão falhar, reutiliza a tentativa e consulta o servidor para verificar se o registro já existe, evitando uma nova batida apenas por repetir o envio.

**Não há fila de gravação offline com sincronização automática.** Uma tentativa pendente não comprova que o ponto foi registrado. Confira a confirmação e o histórico antes de limpar os dados do aplicativo ou tentar outro procedimento.

Android e RFID usam fontes diferentes, `batidasMobile` e `registros`, integradas pelo sistema web. Alterações nas regras ou no controle de intervalo precisam considerar os dois clientes.

## Configuração para desenvolvimento

### Requisitos

- Android Studio com Android SDK Platform 35 instalado.
- JDK 21 para reproduzir a compilação validada; o código gera bytecode Java/Kotlin 17.
- Projeto Firebase com Authentication por e-mail/senha e Realtime Database configurados.
- Internet para autenticação, consulta e confirmação das batidas.
- Para os testes Firebase: Node.js 22 ou superior e Java 21 disponíveis no ambiente.

### Obter o projeto

```powershell
git clone https://github.com/Tenpo0000/mixponto-android.git
cd mixponto-android
```

Abra essa pasta no Android Studio e configure o **Gradle JDK** como JDK 21. O arquivo `local.properties` deve apontar para o SDK da sua máquina; não copie caminhos pessoais de outro computador.

### Configurar o Firebase

1. Registre um aplicativo Android no seu projeto Firebase com o pacote `br.com.mixponto.app`.
2. Coloque a configuração Android correspondente em `app/google-services.json`.
3. Confira se o app, o site e o terminal usam o mesmo ambiente Firebase.
4. Revise e publique as regras de `spark/database.rules.json` no banco correto.
5. Crie/libere o vínculo do funcionário pelo sistema web.

A configuração de cliente `google-services.json` não é a chave administrativa de uma conta de serviço. **Nunca inclua Firebase Admin SDK ou chave privada no APK.** A segurança dos dados depende da autenticação e das regras do banco.

O código mantém a URL da instância original como fallback nos repositórios REST. Se trocar de projeto, confira tanto a configuração Firebase quanto esse fallback em `PontoRepository.kt` e `PrivacyRepository.kt`.

Instalar outro APK não publica regras nem configura vínculos. Não abra o banco para acesso público como solução para erros de permissão.

## Compilar e analisar

No terminal PowerShell, na raiz do projeto:

```powershell
# Use o caminho do JDK 21 instalado na sua máquina.
$env:JAVA_HOME = 'C:\caminho\para\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

.\gradlew.bat :app:assembleDebug :app:lintDebug --console=plain
```

APK gerado: `app/build/outputs/apk/debug/app-debug.apk`.

Relatório de análise: `app/build/reports/lint-results-debug.html`.

Para executar pelo Android Studio, selecione um aparelho/emulador com Android 8.0 ou superior e execute o módulo `app`. A distribuição comercial requer assinatura release própria e preparação para publicação; a chave de assinatura não deve ir para o Git.

## Testar regras e integração

Na raiz do projeto:

```powershell
npm ci --prefix spark
npm test --prefix spark
```

A suíte usa o projeto fictício `demo-mixponto` nos emuladores locais de Authentication e Realtime Database. Ela verifica isolamento de contas, permissões, revogação, tentativas repetidas, integração REST/site/RFID e solicitações de privacidade.

Para regenerar o JSON depois de editar o gerador das regras:

```powershell
npm run rules --prefix spark
```

Regenerar esse arquivo não o publica no Firebase. Revise o resultado e mantenha a cópia do projeto web compatível. Testes em emuladores e lint não substituem uso em aparelho, testes de conexão, rotação de tela e TalkBack.

## Estrutura

```text
app/
  src/main/java/br/com/mixponto/app/
    MainActivity.kt          # Login, estado do acesso e registro de ponto
    PontoRepository.kt       # Transporte REST e confirmação das batidas
    LegalActivity.kt         # Políticas disponíveis offline
    PrivacyActivity.kt       # Formulário e acompanhamento de solicitações
    PrivacyRepository.kt     # Pedidos autenticados por conta e identidade
    LegalLayouts.kt          # Tratamento compartilhado das barras do sistema
  src/main/assets/           # Cópia local dos textos de políticas
  src/main/res/              # Estilos, textos e recursos Android
spark/
  generate-rules.mjs         # Fonte das regras do banco
  database.rules.json        # Regras geradas
  test/                     # Testes com emuladores
scripts/
  sync-legal.mjs             # Sincronização dos documentos do site
firmware/                   # Integração do terminal ESP32/RFID
site-integration/           # Arquivos auxiliares de integração web
historico/                  # Material de versões anteriores
```

O módulo Android ativo é `app`, conforme `settings.gradle.kts`. A pasta `backend` contém material separado e não integra a compilação nem o fluxo atual de batidas. O sistema web completo é mantido em repositório próprio; `site-integration` não deve substituí-lo integralmente.

## Privacidade e documentos

Os textos compartilhados têm como fonte `src/legal/politicas.json` no projeto do site. Para sincronizar antes de compilar:

```powershell
$env:MIXPONTO_SITE_ROOT = 'C:\caminho\para\Sistema-de-ponto'
node scripts/sync-legal.mjs
```

Não edite a cópia de `app/src/main/assets/politicas.json` isoladamente. A consulta das políticas funciona offline; pedidos e respostas precisam de conexão e autenticação.

O canal de privacidade não exige CPF ou anexos e não exclui automaticamente registros trabalhistas. A empresa responsável precisa analisar e responder aos pedidos. Não há notificação automática por e-mail.

Não foram adicionados SDKs de publicidade ou Analytics. O app não solicita GPS, câmera, microfone ou contatos. O manifesto declara internet; bibliotecas Firebase podem acrescentar permissões técnicas, como estado da rede. Backups e transferência dos dados do app estão desativados na configuração Android.

Os dados reais do responsável pelo serviço ainda precisam ser definidos nos textos preliminares. Não há garantia de conformidade jurídica integral ou de uso como registrador oficial de jornada.

## Problemas frequentes

| Situação | O que conferir |
| --- | --- |
| ID não encontrado | Copie o número do cabeçalho da conta no site; não use o UID do usuário |
| Acesso não liberado ou revogado | Confira o vínculo e a situação do funcionário pelo cadastro web |
| Permissão recusada | Verifique regras publicadas, projeto configurado e conta selecionada |
| Batida recusada | Confira vínculo, admissão e intervalo entre batidas; consulte o histórico |
| Envio sem confirmação | Restaure a conexão e repita a mesma tentativa; não presuma registro offline |
| Falha de compilação | Confira JDK 21, SDK 35 e `app/google-services.json` |

Se houver exigência de App Check no ambiente, a integração dos respectivos tokens precisa ser avaliada antes de operar: o fluxo REST atual não fornece automaticamente essa proteção.

## Documentação complementar

- [Textos de políticas incluídos no aplicativo](app/src/main/assets/politicas.json)
- [Contas e identificadores numéricos](CONTAS-1.5.md)
- [Componentes de terceiros](TERCEIROS.md)

Os documentos de entregas anteriores registram a evolução do projeto e podem descrever estruturas já substituídas, como permissões na raiz do banco. Confira a versão antes de aplicar instruções históricas em produção.

## Licenças

As condições dos componentes estão descritas em [TERCEIROS.md](TERCEIROS.md), incluindo a licença do Gradle Wrapper. O repositório não contém uma licença geral própria para o código do aplicativo; não se presume que a licença de uma dependência se aplique ao projeto inteiro.
