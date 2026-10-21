// O código público é sequencial; as chaves internas preservam os vínculos existentes.
export const codigoLoginEmpresa = (empresa) => /^[1-9][0-9]{0,8}$/.test(empresa?.codigoApp || '') ? empresa.codigoApp : '';
export const caminhoEmpresa = (conta, id) => `contas/${conta}/${id === 'padrao' ? 'empresa' : `empresas/${id}`}`;

export async function publicarIdEmpresa(fb, conta, empresa, payload) {
    const path = caminhoEmpresa(conta, empresa.id);
    const uid = fb.auth?.currentUser?.uid;
    const conferirSessao = () => {
        if ((fb.contaAtiva && fb.contaAtiva.id !== conta) || (uid && fb.auth.currentUser?.uid !== uid)) throw Error('A sessão mudou. Entre novamente.');
    };
    for (let tentativa = 0; tentativa < 12; tentativa++) {
        conferirSessao();
        const atual = (await fb.get(fb.ref(fb.db, path))).val();
        if (!atual && !payload) throw Error('Empresa não encontrada.');
        const existente = codigoLoginEmpresa(atual);
        if (existente) {
            conferirSessao();
            if (payload) await fb.update(fb.ref(fb.db), { [path]: { ...payload, codigoApp: existente } });
            return existente;
        }
        const ultimo = (await fb.get(fb.ref(fb.db, 'sequenciaEmpresas'))).val() ?? 0;
        if (!Number.isSafeInteger(ultimo) || ultimo < 0 || ultimo >= 999999999) throw Error('Não foi possível gerar o próximo ID da empresa.');
        const numero = ultimo + 1, codigo = String(numero);
        const changes = {
            sequenciaEmpresas: numero,
            [`empresasPorId/${codigo}`]: { contaId: conta, empresaId: empresa.id },
            [payload ? path : `${path}/codigoApp`]: payload ? { ...payload, codigoApp: codigo } : codigo,
        };
        try {
            conferirSessao();
            // As regras aceitam somente o próximo número e o vínculo no mesmo lote.
            await fb.update(fb.ref(fb.db), changes);
            return codigo;
        } catch (error) {
            conferirSessao();
            // A empresa pode ter sido numerada depois da primeira leitura, mas
            // antes de lermos o contador. Nesse caso o contador já não muda.
            const confirmado = (await fb.get(fb.ref(fb.db, path))).val();
            if (codigoLoginEmpresa(confirmado)) continue;
            const depois = (await fb.get(fb.ref(fb.db, 'sequenciaEmpresas'))).val() ?? 0;
            if (depois === ultimo) throw error;
            // Outra criação venceu, ou a resposta de uma gravação confirmada se perdeu.
            // Releia a empresa antes de tentar; ela pode já ter recebido seu número.
        }
    }
    throw Error('Há várias empresas sendo criadas agora. Tente salvar novamente.');
}
