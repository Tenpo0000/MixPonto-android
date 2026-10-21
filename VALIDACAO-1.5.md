# Validação 1.5 — numeração por conta

143 testes aprovados (74 site, 5 serviço, 64 emuladores). APK 1.5: versionCode 6, compilado com JBR 21/Gradle 8.11.1. SHA256: 8A7AC67BF887815677B3D26B37C83BF4CCCB1B25D132B9F7EC71814B6939A2C4.

Correção aplicada ao banco real em 20/10/2026: 1 conta com 2 empresas internas, ID público 1 e sequenciaContas 1. A próxima conta recebe 2. Índice contasPorId referencia somente contaId, sem empresaId. O código fica em contas/{contaId}/meta/codigoApp. Cadastro de empresas usa gravação operacional e não toca no contador.

Backup antes da aplicação: C:\Users\Laerte\Desktop\MixPonto-contas-1.5-aplicacao-2026-10-20. O arquivo resultado.json confirma aplicado=true e verificadoNoFirebase=true. As regras foram publicadas e comparadas às regras locais. O controle ETag/If-Match evita perder alterações feitas após o backup. As coleções operacionais foram comparadas integralmente e preservadas. O serviço local foi reiniciado e a descoberta administrativa foi conferida em leitura, retornando uma conta com código 1.

O APK 1.5 consulta contasPorId e valida o vínculo dentro da conta. Mantém isolamento entre funcionários de empresas internas diferentes, porém ambos usam o mesmo ID da conta. Não foi instalado em celular físico. Não houve teste visual de navegação no navegador nem simulação de login do usuário real; as validações de Auth/clientes foram realizadas nos emuladores.
