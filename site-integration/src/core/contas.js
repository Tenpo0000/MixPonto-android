// Convites por e-mail: a autorização continua sendo validada pelas regras do banco.
export function chaveEmail(email) {
    return String(email || '').trim().toLowerCase().replace(/[% .#$\[\]\/]/g,
        (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export async function contasDisponiveis(fb, user) {
    const token = await user.getIdToken();
    try {
        const response = await fetch(fb.contasApiUrl || '/api/contas', {
            headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Serviço indisponível.');
        const result = await response.json();
        if (!Array.isArray(result.contas)) throw Error('Resposta inválida.');
        return result.contas.filter((c) => /^[a-zA-Z0-9_-]{1,128}$/.test(c.id) &&
            ['administrador', 'rh', 'visualizador'].includes(c.permissao)).map((c) => ({
                id: c.id, nome: String(c.nome || 'Empresa'), permissao: c.permissao, titular: c.titular === true,
                codigoApp: /^[1-9][0-9]{0,8}$/.test(c.codigoApp || '') ? c.codigoApp : '',
            }));
    } catch {
        throw Object.assign(Error('Não foi possível consultar suas empresas. Confira se o serviço /api/contas está configurado e disponível. As permissões ficam dentro de cada conta.'), { code: 'contas/indisponivel' });
    }
}

export async function salvarUsuarioComAcesso(fb, owner, id, anterior, usuario, nomeConta) {
    if (!owner || !fb.auth.currentUser) throw Error('Entre na empresa antes de liberar acessos.');
    const updates = { [`contas/${owner}/usuarios/${id}`]: usuario };
    if (!usuario.titular) {
        updates[`contas/${owner}/acessosContas/${chaveEmail(usuario.email)}`] = {
            usuarioId: id, email: usuario.email, nomeConta: nomeConta || 'Empresa',
            permissao: usuario.permissao, status: usuario.status,
        };
        if (anterior?.email && chaveEmail(anterior.email) !== chaveEmail(usuario.email))
            updates[`contas/${owner}/acessosContas/${chaveEmail(anterior.email)}`] = null;
    }
    await fb.update(fb.ref(fb.db), updates);
}
