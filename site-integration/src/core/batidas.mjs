export const ZONE = 'America/Sao_Paulo';

export function timestampMs(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string') return NaN;
    const naive = /T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value);
    return Date.parse(naive ? `${value}-03:00` : value);
}

export function dayKey(value = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(value));
    const part = (type) => parts.find((p) => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

export function admissionMs(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Preencha a admissão em AAAA-MM-DD no cadastro.');
    const ms = Date.parse(`${date}T00:00:00-03:00`);
    if (!Number.isFinite(ms) || dayKey(ms) !== date) throw new Error('Data de admissão inválida.');
    return ms;
}

// Esta coleção é a fonte comum para tela, cálculos e impressão/PDF.
export function mergeRecords(legacy = {}, mobile = {}, start = '0000-01-01', end = '9999-12-31') {
    const result = [];
    const add = (id, fid, day, record, source) => {
        const ms = timestampMs(record.timestamp);
        if (!Number.isFinite(ms)) return;
        const normalizedDay = source === 'android' ? dayKey(ms) : day;
        if (normalizedDay < start || normalizedDay > end) return;
        result.push({ ...record, id, funcionarioId: fid, dia: normalizedDay, ms,
            timestamp: new Date(ms).toISOString(), origem: source, manual: source === 'manual' && record.manual === true });
    };
    for (const [day, employees] of Object.entries(legacy || {})) {
        for (const [fid, records] of Object.entries(employees || {})) {
            for (const [id, r] of Object.entries(records || {})) add(id, fid, day, r, r.manual ? 'manual' : r.origem || 'esp32');
        }
    }
    for (const [fid, records] of Object.entries(mobile || {})) {
        for (const [id, r] of Object.entries(records || {})) add(id, fid, null, r, 'android');
    }
    return result.sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id));
}

export function workedMinutes(records) {
    const groups = new Map();
    for (const r of records) {
        const key = `${r.funcionarioId}/${r.dia}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    let minutes = 0;
    for (const group of groups.values()) {
        group.sort((a, b) => a.ms - b.ms);
        for (let i = 0; i + 1 < group.length; i += 2) minutes += (group[i + 1].ms - group[i].ms) / 60000;
    }
    return minutes;
}
