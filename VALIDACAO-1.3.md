# Validação 1.3 — ID do cadastro da empresa

O cabeçalho mostra o ID do registro em Cadastro → Empresa. Havendo várias empresas, o segundo seletor escolhe o ID mostrado. O UID do titular permanece apenas como namespace interno. O cadastro legado recebe codigoApp estável.

O Android 1.3 recebe esse código, resolve empresasPorId/{codigo} e confere empresaId do funcionário antes de consultar o perfil ou confirmar uma batida. Solicitações, vínculos, credenciais e batidas continuam dentro de contas/{contaId}. O diretório contém somente os dois identificadores de localização.

Validações executadas:
- 67 testes locais do site aprovados.
- 52 testes Auth/Realtime Database em emuladores aprovados, incluindo diretório sem listagem, proteção contra substituição do proprietário, referência inexistente, código legado imutável, leitura restrita de empresaId e headers X-Conta-ID/X-Empresa-ID.
- Compilação Android :app:assembleDebug aprovada com JBR 21 e Gradle 8.11.1; versionCode 4, versionName 1.3.

Publique firebase/database.rules.json do site (idêntico a spark/database.rules.json), abra o site atualizado como administrador e instale dist/MixPonto-contas-1.3-debug.apk. Os APKs anteriores foram preservados. A lista titularesAutorizados existente não muda.

Não houve publicação no Firebase nem instalação/teste físico em celular. A validação do site não incluiu navegação visual no navegador. site-integration é uma cópia histórica de UI; os testes importam os módulos compartilhados atualizados, e o ZIP de entrega é montado diretamente do site ativo.
