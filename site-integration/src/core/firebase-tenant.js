// REST mantém o ID no header HTTP; as regras validam o mesmo ID no caminho.
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { ref as sdkRef, push as sdkPush, get as sdkGet, onValue as sdkOnValue } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
export { serverTimestamp, getDatabase, connectDatabaseEmulator } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
const databases = new WeakMap();
export function ref(db, path) { const result = sdkRef(db, path); databases.set(result, db); return result; }
export function push(parent) { const result = sdkPush(parent); databases.set(result, databases.get(parent)); return result; }

function tenant(reference, changes) {
    const path = new URL(reference.toString()).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (path[0] === 'contas') return path[1];
    if (path[0] === 'contasPorId' && changes?.contaId) return changes.contaId;
    const ids = new Set(Object.keys(changes || {}).map((p) => p.split('/'))
        .map((p) => p[0] === 'contas' ? p[1] :
            p[0] === 'contasPorId' ? changes[p.join('/')]?.contaId : null).filter(Boolean));
    if (ids.size > 1) throw Error('Uma requisição não pode alterar duas empresas.');
    return [...ids][0] || null;
}

function snapshot(reference, value) {
    return { key: reference.key, val: () => value == null ? null : JSON.parse(JSON.stringify(value)), exists: () => value != null };
}

function fail(status) {
    const error = new Error(status === 401 || status === 403 ? 'Permissão recusada pelo Firebase.' : 'O servidor não confirmou a operação.');
    error.code = status === 401 || status === 403 ? 'permission_denied' : 'network_error';
    return error;
}

async function request(reference, method = 'GET', value, extra = {}, signal) {
    const database = databases.get(reference);
    if (!database) throw Error('Referência de dados desconhecida.');
    const auth = getAuth(database.app), user = auth.currentUser;
    if (!user) throw Error('Sessão não autenticada.');
    const id = tenant(reference, value);
    const token = await user.getIdToken();
    if (auth.currentUser?.uid !== user.uid) throw Error('A sessão mudou.');
    const url = new URL(reference.toString());
    url.pathname = url.pathname.replace(/\/$/, '') + '.json';
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        url.searchParams.set('ns', new URL(database.app.options.databaseURL).hostname.split('.')[0]);
    url.searchParams.set('auth', token);
    const deadline = signal ? null : new AbortController();
    const timer = deadline ? setTimeout(() => deadline.abort(), 20000) : null;
    try { return await fetch(url, {
        method, cache: 'no-store', signal: signal || deadline.signal,
        headers: { ...(id ? { 'X-Conta-ID': globalThis.window?.fb?.contaAtiva?.id === id && window.fb.contaAtiva.codigoApp || id } : {}),
            ...(value !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra },
        ...(value !== undefined ? { body: JSON.stringify(value) } : {}),
    }); } finally { if (timer) clearTimeout(timer); }
}

export async function get(reference) {
    if (!tenant(reference)) return sdkGet(reference); // Descoberta dos acessos antes da seleção da conta.
    const response = await request(reference);
    if (!response.ok) throw fail(response.status);
    return snapshot(reference, await response.json());
}

export async function set(reference, value) {
    const response = await request(reference, 'PUT', value);
    if (!response.ok) throw fail(response.status);
}
export async function update(reference, changes) {
    const response = await request(reference, 'PATCH', changes);
    if (!response.ok) throw fail(response.status);
}
export const remove = (reference) => set(reference, null);

export async function runTransaction(reference, mutate) {
    for (let attempt = 0; attempt < 25; attempt++) {
        const current = await request(reference, 'GET', undefined, { 'X-Firebase-ETag': 'true' });
        if (!current.ok) throw fail(current.status);
        const value = await current.json(), next = mutate(value);
        if (next === undefined) return { committed: false, snapshot: snapshot(reference, value) };
        const etag = current.headers.get('etag');
        if (!etag) throw Error('O Firebase não confirmou a versão dos dados.');
        const response = await request(reference, 'PUT', next, { 'If-Match': etag });
        if (response.status === 412) continue;
        if (!response.ok) throw fail(response.status);
        return { committed: true, snapshot: snapshot(reference, await response.json()) };
    }
    throw Error('Os dados mudaram durante a gravação. Tente novamente.');
}

function mergeEvent(current, path, value) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return value;
    const root = current && typeof current === 'object' ? current : {};
    let node = root;
    for (const key of parts.slice(0, -1)) {
        if (!Object.hasOwn(node, key) || !node[key] || typeof node[key] !== 'object')
            Object.defineProperty(node, key, { value: {}, writable: true, enumerable: true, configurable: true });
        node = node[key];
    }
    if (value === null) delete node[parts.at(-1)];
    else Object.defineProperty(node, parts.at(-1), { value, writable: true, enumerable: true, configurable: true });
    return root;
}

const streams = new Map();
export function onValue(reference, callback, onError = () => {}) {
    const active = globalThis.window?.fb?.contaAtiva;
    const parts = new URL(reference.toString()).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'contas' && active?.id === parts[1] && parts.length > 2 &&
        active.permissao === 'administrador') {
        const database = databases.get(reference);
        const key = `${database.app.name}:${getAuth(database.app).currentUser?.uid}:${active.id}`;
        let stream = streams.get(key);
        if (!stream) {
            stream = { subscribers: new Set(), ready: false, value: null };
            streams.set(key, stream);
            stream.off = listenReference(ref(database, `contas/${active.id}`), (snapshot) => {
                stream.value = snapshot.val(); stream.ready = true;
                for (const subscriber of stream.subscribers) subscriber.next();
            }, (error) => { for (const subscriber of stream.subscribers) subscriber.error(error); });
        }
        const subscriber = {
            next: () => callback(snapshot(reference, parts.slice(2).reduce((value, name) =>
                value && Object.hasOwn(value, name) ? value[name] : null, stream.value))),
            error: onError,
        };
        stream.subscribers.add(subscriber);
        if (stream.ready) subscriber.next();
        return () => {
            stream.subscribers.delete(subscriber);
            if (!stream.subscribers.size) { stream.off(); streams.delete(key); }
        };
    }
    // Visualizadores não leem a raiz privada; GETs finitos evitam dezenas de SSEs por aba.
    if ((active?.permissao === 'visualizador' || active?.permissao === 'rh') && parts[0] === 'contas') {
        let stopped = false, timer, previous;
        async function poll() {
            try {
                const value = await get(reference);
                const encoded = JSON.stringify(value.val());
                if (!stopped && encoded !== previous) { previous = encoded; callback(value); }
            } catch (error) {
                if (!stopped) onError(error);
                if (error.code === 'permission_denied') stopped = true;
            }
            if (!stopped) timer = setTimeout(poll, 15000);
        }
        poll();
        return () => { stopped = true; clearTimeout(timer); };
    }
    return listenReference(reference, callback, onError);
}

function listenReference(reference, callback, onError = () => {}) {
    if (!tenant(reference)) return sdkOnValue(reference, callback, onError);
    let stopped = false, controller, reader, timer, retry = 1000;
    async function listen() {
        controller = new AbortController();
        let value = null;
        try {
            const response = await request(reference, 'GET', undefined, { Accept: 'text/event-stream' }, controller.signal);
            if (!response.ok) throw fail(response.status);
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            retry = 1000;
            while (!stopped) {
                const chunk = await reader.read();
                if (chunk.done) break;
                buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                    const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
                    const event = frame.match(/^event:\s*(.+)$/m)?.[1];
                    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
                    if (event === 'cancel') throw fail(403);
                    if (event === 'auth_revoked') {
                        try { await getAuth(databases.get(reference).app).currentUser.getIdToken(true); }
                        catch { throw fail(401); }
                        const refresh = new Error('Reconectando a assinatura.'); refresh.code = 'token_refreshed'; throw refresh;
                    }
                    if ((event === 'put' || event === 'patch') && data) {
                        const change = JSON.parse(data);
                        if (event === 'put') value = mergeEvent(value, change.path, change.data);
                        else for (const [key, patch] of Object.entries(change.data || {}))
                            value = mergeEvent(value, `${change.path.replace(/\/$/, '')}/${key}`, patch);
                        if (!stopped) callback(snapshot(reference, value));
                    }
                }
            }
        } catch (error) {
            if (stopped) return;
            if (error.code !== 'token_refreshed') onError(error);
            if (error.code === 'permission_denied') { stopped = true; controller.abort(); return; }
        }
        if (!stopped) { timer = setTimeout(listen, retry); retry = Math.min(retry * 2, 30000); }
    }
    listen();
    return () => { stopped = true; clearTimeout(timer); reader?.cancel().catch(() => {}); controller?.abort(); };
}
