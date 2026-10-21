# MixPonto Android 1.1 — Firebase Spark

O aplicativo usa Firebase Authentication e Realtime Database REST diretamente. Não usa Cloud Functions nem requer publicação de funções.

- Titular seleciona um funcionário existente no site e define o e-mail e a senha de acesso.
- O site cria o login e o vínculo sem encerrar a sessão do titular. A senha fica somente no Firebase Authentication, sem cópia no Realtime Database.
- O funcionário entra no app com os dados recebidos e pode bater ponto. Não há código de acesso nem confirmação de e-mail obrigatória.
- Batida móvel e controle de intervalo são gravados juntos, com horário do servidor e regras verificadas no emulador.
- Solicitações pendentes mantêm o mesmo UUID por login/empresa/funcionário. A confirmação depende de leitura do servidor.
- RFID continua em `contas/UID/registros`; celular grava em `contas/UID/batidasMobile`.

O guia histórico INSTALACAO-SPARK.md não está mais incluído no repositório. Para a configuração atual, consulte o [README principal](../README.md); as instruções abaixo registram a versão 1.1.

## Estado da entrega

O APK debug 1.1 (versionCode 2) compilou com a configuração real de `mixponto-ffe50`, usando JDK 21, Gradle 8.11.1 e SDK 35. Os 36 testes de segurança e integração passaram nos emuladores Authentication e Realtime Database. O firmware permanece igual à entrega anterior, compilada para ESP32 clássico; os resultados estão no relatório.

Não houve publicação em produção, criação de usuários reais, batida real ou teste físico de Android/RFID. A inspeção visual do navegador foi recusada pelo controle de permissão.

A cópia do site fornecida contém uma interface antiga e ações administrativas simuladas. A integração entregue acrescenta autenticação do titular, vínculo/revogação e leitura conjunta no cartão/total/impressão. **Não contém a versão completa de cadastros, jornadas, faltas/atrasos, justificativas ou edição manual citada no pedido. A entrega integral ainda depende de recuperar esses módulos e conferir suas regras atuais.**

## Compilar

No Android Studio, abra esta pasta. Use JDK 17 ou 21, Android SDK Platform 35 e Build Tools 35.0.0. O pacote é `br.com.mixponto.app`. Configure `app/google-services.json` do mesmo projeto Firebase. Execute:

```powershell
.\gradlew.bat assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`. O APK debug serve para validação; distribuição exige assinatura release própria.

## Testar regras e integração

Com Node.js 22 e Java 21 no PATH:

```powershell
cd spark
npm ci
npm test
```

O comando usa somente o projeto fictício `demo-mixponto` no emulador local. Não acessa o banco real. Para regenerar o JSON das regras após editar o gerador: `npm run rules`.

## Arquivos

- `app/src/main/java/br/com/mixponto/app/`: telas, autenticação e protocolo REST.
- `spark/database.rules.json`: regras publicáveis.
- `spark/test/`: criação real de contas no emulador Auth, segurança, integração REST/site/RFID e normalização.
- `site-integration/`: cópia dos arquivos web alterados, mantendo os caminhos do repositório.
- `firmware/PontoESP32/`: firmware atualizado, sem credenciais pessoais.
- `historico/functions-anteriores.zip`: cópia local do backend retirado, sem uso no fluxo novo e fora do pacote de instalação.

As ferramentas de teste são dependências locais de desenvolvimento; nenhuma biblioteca administrativa é incluída no APK ou no site.
