# Isolamento por conta — MixPonto 1.4

As alterações estão no código local. A imagem do Console representa o banco anterior; os nós existentes não mudam de lugar ao atualizar apenas o site ou as regras. A migração do banco real e a configuração da hospedagem/credenciais do serviço ainda precisam ser executadas.

## Estrutura entregue

```text
contas/{contaId}/
  meta/ownerUid
  titularesAutorizados/{ownerUid}: true
  acessosContas/{emailCodificado}/
    usuarioId, email, nomeConta, permissao, status
  usuarios/{perfilId}
  solicitacoesMobile/{authUid}
  acessosMobile/{authUid}
  mobileAcessos/{authUid}
  credenciaisApp/{funcionarioId}
  mobileConfig/{funcionarioId}
  funcionarios/{funcionarioId}
  batidasMobile/{funcionarioId}
  ... demais cadastros e registros

empresasPorId/{idNumerico}/
  contaId, empresaId
sequenciaEmpresas: ultimoNumero
```

Somente os identificadores de localização e o contador da numeração ficam globais. Não há permissões, solicitações, senhas ou vínculos móveis na raiz. Os números 1, 2, 3… existentes são preservados. As chaves internas das contas e dos cadastros permanecem para preservar referências e históricos.

## Atualização do banco existente

1. Exporte a raiz completa do Realtime Database e guarde a cópia original. Interrompa as gravações durante a migração para não substituir registros posteriores à exportação.
2. Na raiz do projeto do site, execute com os caminhos reais dos arquivos:

   ```powershell
   node firebase/migrar-isolamento.mjs C:\backup\exportacao.json C:\backup\banco-isolado.json
   ```

3. Revise `banco-isolado.json.relatorio.json`. Solicitações sem vínculo que identifique a conta ficam nesse relatório local; não são atribuídas a uma empresa por suposição. Vínculos revogados já existentes dentro da conta prevalecem sobre o legado da raiz. Perfis administrativos atuais definem papel e situação dos acessos migrados.
4. Substitua os dados da raiz no Console pelo JSON migrado, preservando o backup. A operação precisa substituir a estrutura anterior: apenas mesclar o JSON não remove os quatro nós antigos. O script prepara arquivos locais, não escreve no Firebase e não altera a exportação original.
5. Publique o conteúdo completo de `firebase/database.rules.json`. As novas regras não consultam nem permitem leitura/escrita dos quatro nós legados globais, mesmo que alguém ainda os tenha deixado na raiz.
6. Configure o serviço de descoberta conforme [servidor/README.md](servidor/README.md). Não troque a instalação em uso antes de ter banco migrado, regras e serviço prontos.
7. Recarregue o site e instale o APK `MixPonto-contas-1.4-debug.apk`. Faça login e confira as empresas disponíveis e uma conta de funcionário. O APK usa apenas o vínculo móvel dentro da conta resolvida pelo ID informado.

## Banco vazio e primeiro titular

Um login novo no Authentication não se torna administrador por conta própria. Para inicializar um titular já autorizado pelo responsável do sistema, o provisionamento administrativo cria `contas/{uid}/titularesAutorizados/{uid} = true` dentro da conta correspondente. Não recrie `titularesAutorizados` na raiz. O site completa os metadados da conta quando esse titular entra. Cadastro comercial e cobrança automática não fazem parte desta atualização.

## Descoberta e acesso

O mesmo e-mail continua vendo automaticamente suas empresas autorizadas em qualquer dispositivo. O serviço valida o token e verifica as permissões separadamente em cada conta. A seleção no navegador é conveniência: não concede acesso. Bloquear o perfil ou o acesso daquela conta afeta apenas aquela conta. O banco continua validando os caminhos por conta, inclusive nos acessos diretos feitos fora do site.

O ID numérico exibido no cabeçalho continua sendo o código para o login mobile. Ele não é senha. O app recebe esse código, resolve os dois IDs internos e verifica se o funcionário pertence à empresa selecionada antes de confirmar o ponto.

O cartão ponto mantém os fundos alternados entre os dias. A mudança de estrutura não altera as datas, batidas ou vínculos de RFID.
