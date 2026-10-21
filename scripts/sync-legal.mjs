import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = process.env.MIXPONTO_SITE_ROOT || 'C:/Users/Laerte/Documents/GitHub/Sistema-de-ponto';
const source = await fs.readFile(path.join(site, 'src/legal/politicas.json'), 'utf8');
const policy = JSON.parse(source);
if (!policy.versao || !Array.isArray(policy.documentos)) throw Error('Conteúdo jurídico inválido.');
const folder = path.join(root, 'app/src/main/assets');
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(path.join(folder, 'politicas.json'), JSON.stringify(policy, null, 2) + '\n');
console.log(`Políticas sincronizadas: ${policy.versao}. Não altere a cópia do Android manualmente.`);
