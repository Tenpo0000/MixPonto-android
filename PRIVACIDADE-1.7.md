# MixPonto Android 1.7 — privacidade e acessibilidade

**Revisão disponível: 1.7.1/código 8**, em `dist/MixPonto-privacidade-1.7.1-debug.apk`. Corrige tentativas editadas após falha e fixa a identidade nas operações assíncronas de privacidade. Compilação e lint novamente aprovados. SHA256 em `dist/MixPonto-privacidade-1.7.1-SHA256.txt`. O restante deste documento descreve a entrega inicial 1.7; o relatório atual é `REVISAO-PRIVACIDADE.md` no projeto do site.

Atualização de 20/10/2026. `versionName = 1.7`, `versionCode = 7`.

## Conteúdo desta versão

- Políticas disponíveis antes do login, sem depender de internet. O conteúdo é compartilhado com o site; não altere manualmente `app/src/main/assets/politicas.json`.
- Canal autenticado para solicitar acesso, correção, análise de eliminação, informações, oposição, revogação de consentimento ou comunicar barreiras de acessibilidade.
- Pedidos e respostas isolados por conta e usuário em `contas/{contaId}/privacidade/{uid}/{protocolo}`. O canal não depende de autorização ativa para bater ponto; as regras verificam o vínculo com a conta.
- Nenhuma exclusão automática de cadastros ou registros de ponto. A empresa precisa analisar os pedidos, as obrigações de conservação e responder pelo canal.
- Nenhum SDK de publicidade ou Analytics adicionado. O manifesto do app declara internet; as dependências Firebase acrescentam permissões técnicas de estado da rede e leitura de configuração dos serviços Google. O app não solicita GPS, câmera, microfone ou contatos.
- Backup e transferência de dados do app desativados. O campo de senha não é salvo no estado da tela; a sessão é gerenciada pelo Firebase Authentication.
- Rótulos associados aos campos, títulos acessíveis, retorno de resultados por região acessível, foco de teclado, contraste de texto e alvos dos controles de pelo menos 48 dp. Conteúdo respeita barras do sistema, recortes e teclado.
- Formulário mantém campos em recriações de tela. Repetições de uma solicitação só confirmam o mesmo conteúdo no mesmo protocolo, evitando confirmação enganosa após falhas de rede.

## Atualizar os textos e compilar

Na pasta deste projeto, em PowerShell:

```powershell
node scripts/sync-legal.mjs
$env:JAVA_HOME = 'C:\Users\Laerte\.jdks\jbr-21.0.11'
$env:GRADLE_USER_HOME = 'C:\Users\Laerte\.gradle'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :app:assembleDebug :app:lintDebug --console=plain
```

Se o site estiver em outro local, defina `MIXPONTO_SITE_ROOT` antes da sincronização. O arquivo fonte é `src/legal/politicas.json` do site.

APK: `dist/MixPonto-privacidade-1.7-debug.apk`. A soma de verificação está em `dist/MixPonto-privacidade-1.7-SHA256.txt`.

## Verificação realizada e limites

Compilação debug e lint concluídos com JDK 21. O lint registrou zero erros e um aviso de versão mais recente do Firebase BOM; a biblioteca não foi atualizada sem necessidade nesta alteração. Relatórios: `app/build/reports/lint-results-debug.html` e `.txt`.

Não foram realizados testes em aparelho físico, inspeção visual interativa, auditoria completa de TalkBack nem certificação de acessibilidade ou conformidade legal. O APK debug serve para validação; a distribuição comercial exige assinatura e processo de publicação apropriados.

Os textos são preliminares: nome, identificação, endereço e contato do responsável ainda não foram fornecidos. A falta de empresa constituída não elimina obrigações da pessoa física responsável. É necessário definir esses dados, atendimento, retenção e contratos antes de oferecer o serviço comercialmente.

O canal de pedidos depende de conexão e da publicação das regras de privacidade do site/Firebase. Não envia e-mail automaticamente e não promete resposta automática. Sem login, os textos orientam procurar a empresa empregadora por seus canais disponíveis; o responsável pela plataforma ainda deve definir contato próprio.
