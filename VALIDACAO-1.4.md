# Validação 1.4 — isolamento e descoberta automática

Código ativo do site: C:\Users\Laerte\Documents\GitHub\Sistema-de-ponto.

Permissões de usuários, titulares e solicitações/vínculos móveis estão sob contas/{contaId}. Os quatro nós legados da raiz não participam da autorização. O app 1.4 só consulta o vínculo local; os números públicos, dados operacionais e referências existentes são preservados.

O serviço em servidor/ valida ID tokens com Firebase Admin SDK e checa revogação. Consulta as contas individualmente sem manter índice global de usuários. A listagem continua automática em qualquer dispositivo. O cliente não escolhe a identidade consultada. Não há fallback para índices globais quando o serviço está fora do ar.

Validação: 72 testes locais do site, 4 testes do serviço e 62 testes nos emuladores Auth/Realtime Database, todos aprovados (138 no total). Inclui migração JSON aplicada a dados sintéticos e validada com as regras reais; quatro nós globais negados até para titulares; isolamento entre contas; tokens reais, token forjado, desativação de usuário; descoberta de duas contas; revogação; transporte REST/SSE; numeração concorrente; validações de RFID e batidas preservadas.

APK 1.4: versionCode 5, compilado com JBR 21/Gradle 8.11.1. SHA256: 1D58945AD5809AC565D1C5A1CD5E93AFBD56CF349644E80330DD8B38B6FE0E06.

O conversor firebase/migrar-isolamento.mjs lê uma exportação completa e produz novos arquivos sem escrever no banco real. Pendências de vínculo sem conta identificada ficam em relatório local, junto dos dados originais para revisão. Autorizações locais existentes prevalecem sobre o legado.

Pendências externas: obter/revisar a exportação real, migrar o banco, publicar regras e configurar credenciais/hospedagem HTTPS do serviço. Não houve leitura do banco de produção, publicação, migração real, envio de e-mails, criação de usuários reais ou teste em aparelho físico. Nenhuma navegação visual no navegador foi realizada. A UI antiga de site-integration permanece histórica; o pacote do site é montado a partir do projeto ativo.
