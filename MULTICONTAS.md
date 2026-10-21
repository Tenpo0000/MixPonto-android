# MixPonto 1.4 — acesso a várias contas isoladas

O mesmo login pode selecionar suas empresas autorizadas em qualquer dispositivo. Administradores gerenciam o perfil em Configurações → Usuários; as permissões são gravadas em contas/{contaId}/acessosContas/{emailCodificado}, junto dos demais dados daquela conta. Convidados precisam confirmar o e-mail para aceitar permissões por endereço.

- Administrador: gerencia a conta, os usuários e os acessos móveis.
- RH: edita cadastros e registros operacionais, sem conceder permissões.
- Visualizador: consulta dados operacionais e relatórios.

A descoberta usa o serviço autenticado /api/contas. O navegador não lê uma lista global de autorizações nem consegue enumerar contas diretamente no banco. A seleção é validada novamente pelas regras; bloquear um acesso não altera permissões nas outras contas.

O ID numérico da empresa é automático (1, 2, 3…), permanece ao editar e aparece em Cadastro → Empresa e no cabeçalho. O funcionário informa esse código com e-mail e senha no APK 1.4. Solicitações, vínculos e batidas ficam somente dentro da conta. Não existe fallback para vínculos da raiz.

Consulte [ISOLAMENTO-1.4.md](ISOLAMENTO-1.4.md) para a estrutura, migração e sequência de ativação. A configuração do serviço está em [servidor/README.md](servidor/README.md). Publicar apenas as regras sem migrar os titulares e preparar o serviço deixa a instalação incompleta.

As novas regras preservam os controles de RFID, versão do cartão, intervalo entre batidas, revogação, admissão e permissões por conta. Os headers X-Conta-ID e X-Empresa-ID acompanham os dados HTTP; a autorização depende do token e do caminho do banco.
