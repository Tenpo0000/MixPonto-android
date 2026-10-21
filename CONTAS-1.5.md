# MixPonto 1.5 — um ID por conta

A numeração identifica contas, não cadastros de empresas/unidades. Uma conta pode ter duas ou mais empresas internas e continuará com um único ID para o aplicativo.

Estrutura atual:

```text
contas/{contaId}/meta/codigoApp: "1"
contas/{contaId}/empresas/{empresaId}/...
contasPorId/1/contaId: identificadorInternoDaConta
sequenciaContas: 1
```

O ID público fica nos metadados da conta e no cabeçalho. A lista de Cadastro → Empresa não exibe nem gera IDs de login. Criar, editar ou excluir uma empresa interna não altera o contador. A próxima conta criada recebe 2; reabrir ou editar uma conta não consome outro número. A autorização continua em cada conta, separada dos identificadores globais.

O APK 1.5 solicita ID da conta, e-mail e senha. Ele localiza a conta em contasPorId/{numero} e consulta apenas o vínculo daquele funcionário dentro dela. Funcionários de empresas internas diferentes usam o mesmo ID de conta, mantendo a leitura de perfil e batidas restrita ao próprio vínculo. A seleção da empresa interna continua sendo feita pelo administrador no cadastro do funcionário.

Instale o APK MixPonto-contas-1.5-debug.apk. Para esta instalação, informe o ID 1 no aplicativo, inclusive se antes usava 2 para uma das empresas internas. As versões anteriores usam o índice antigo e precisam ser atualizadas. Os envios pendentes locais são recuperados pelo vínculo de conta e funcionário, sem descartar as solicitações anteriores.

## Atualização aplicada em 20/10/2026

O banco real do projeto mixponto-ffe50 foi atualizado com backup e controle ETag/If-Match, após os testes. Resultado: 1 conta, 2 empresas internas, ID 1 e sequência de contas 1. As coleções operacionais, permissões, credenciais, funcionários e registros foram comparados integralmente antes/depois e preservados. As regras 1.5 foram publicadas e comparadas ao arquivo local. O serviço da porta 8787 foi reiniciado.

Backup atual e regras anteriores: C:\Users\Laerte\Desktop\MixPonto-contas-1.5-aplicacao-2026-10-20. O arquivo resultado.json registra a aplicação e a conferência. Não reimporte o arquivo de migração 1.4: ele contém o índice antigo por empresas.

O site local é http://127.0.0.1:8787/src/index.html. Recarregue com Ctrl + F5 para carregar o novo cabeçalho. O servidor continua precisando ficar em execução; a hospedagem pública HTTPS permanece uma etapa separada.

## Validação

143 testes aprovados: 74 locais do site, 5 do serviço e 64 nos emuladores Auth/Realtime Database. Incluem duas empresas com um ID de conta; duas contas numeradas concorrentemente; mesma conta em duas abas; rejeição de alteração/reutilização/salto do número; headers com ID público; preservação da autorização de funcionários de empresas internas diferentes; migração que cancela se houver escrita depois do backup. O APK 1.5 compilou com JBR 21/Gradle 8.11.1. Não foi instalado em aparelho físico nem foi feita navegação visual de teste.

## Ferramentas para outra instalação

firebase/migrar-ids-contas.mjs converte uma exportação local, sem enviar dados. servidor/atualizar-ids-contas.mjs prepara backup atual e a conversão; somente com --aplicar publica as regras e substitui os dados sob condição ETag. A ferramenta verifica que os dados operacionais não foram alterados pela conversão e exige credencial do projeto correto. O resultado é idempotente: uma conta já numerada mantém seu código.
