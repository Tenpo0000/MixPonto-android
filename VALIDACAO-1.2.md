# Validação 1.2 — 20/10/2026

- Android: `:app:assembleDebug`, Gradle 8.11.1, JBR 21.0.11, **BUILD SUCCESSFUL**.
- Aplicativo: `br.com.mixponto.app`, versionCode **3**, versionName **1.2**.
- Firebase: projeto `mixponto-ffe50`, Realtime Database existente.
- APK: `dist/MixPonto-contas-1.2-debug.apk`, 3.551.791 bytes.
- SHA-256: `DBB2585A374239F3CF19FE2E5C59E238854298B62F9C95797A39364584911541`.
- Testes locais do site: **64 aprovados**.
- Testes Auth/Database em emuladores: **48 aprovados**.

Os testes exercitam permissões por e-mail confirmado em duas empresas, bloqueio independente, visualizador/RH/administrador, impossibilidade de autopromoção, administrador convidado gerenciando acesso móvel, solicitações dentro da empresa, ausência de novas solicitações/vínculos móveis na raiz, dois vínculos para a mesma identidade, header X-Conta-ID, isolamento mesmo com header falso, transações ETag, SSE e encerramento/compartilhamento de assinaturas. A regressão RFID, os intervalos de ponto, a imutabilidade e a revogação continuam cobertos.

O transporte HTTP envia o header nas requisições de dados da conta. O Firebase valida auth e caminhos pelas regras; o header sozinho não concede autorização. Administradores/RH usam um stream compartilhado por empresa. A consulta dos visualizadores é periódica, a cada 15 segundos, nas coleções permitidas.

O login e a interface Android foram compilados, mas não executados em aparelho físico nesta atualização: não há dispositivo conectado. Não houve leitura ou alteração de dados de produção, envio de e-mails reais, publicação de regras, instalação do APK ou batida real. A inspeção visual do navegador anteriormente recusada não foi repetida.

O site ativo está em `C:\Users\Laerte\Documents\GitHub\Sistema-de-ponto`. `dist/MixPonto-site-contas-1.2.zip` empacota esse site e suas regras; o diretório antigo `site-integration` é mantido para os testes e a entrega histórica. Os quatro módulos compartilhados usados pelos testes foram atualizados com os fontes ativos.

O backup anterior às mudanças está em `historico/site-antes-multicontas-20261020-120906.zip`. Os pacotes anteriores foram preservados. A instalação está descrita em `MULTICONTAS.md`.
