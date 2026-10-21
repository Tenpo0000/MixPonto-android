// Um código por conta; empresas/unidades internas não participam da sequência.
export const codigoLoginConta = meta => /^[1-9][0-9]{0,8}$/.test(meta?.codigoApp || '') ? meta.codigoApp : '';

export async function publicarIdConta(fb, conta) {
    const path = `contas/${conta}/meta`;
    const uid = fb.auth?.currentUser?.uid;
    const conferir = () => {
        if ((fb.contaAtiva && fb.contaAtiva.id !== conta) || (uid && fb.auth.currentUser?.uid !== uid)) throw Error('A sessão mudou. Entre novamente.');
    };
    for (let tentativa = 0; tentativa < 12; tentativa++) {
        conferir();
        const meta = (await fb.get(fb.ref(fb.db, path))).val();
        if (!meta?.ownerUid) throw Error('Conta não encontrada.');
        const existente = codigoLoginConta(meta);
        if (existente) return existente;
        const ultimo = (await fb.get(fb.ref(fb.db, 'sequenciaContas'))).val() ?? 0;
        if (!Number.isSafeInteger(ultimo) || ultimo < 0 || ultimo >= 999999999) throw Error('Não foi possível gerar o próximo ID da conta.');
        const codigo = String(ultimo + 1);
        try {
            conferir();
            await fb.update(fb.ref(fb.db), {
                sequenciaContas: ultimo + 1,
                [`contasPorId/${codigo}`]: { contaId: conta },
                [`${path}/codigoApp`]: codigo,
            });
            return codigo;
        } catch (error) {
            conferir();
            if (codigoLoginConta((await fb.get(fb.ref(fb.db, path))).val())) continue;
            if (((await fb.get(fb.ref(fb.db, 'sequenciaContas'))).val() ?? 0) === ultimo) throw error;
        }
    }
    throw Error('Há várias contas sendo numeradas agora. Tente novamente.');
}
