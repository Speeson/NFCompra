import { readFile, writeFile } from 'node:fs/promises';
import { catalogRecordsFromJson, normalizeCatalogImport, buildCatalogImportSql } from '../src/catalog/importer.ts';

const args = process.argv.slice(2);
const noTransaction = args.includes('--no-transaction');
const positional = args.filter((arg) => arg !== '--no-transaction');
const [inputPath, outputPath = 'catalog-import.sql'] = positional;

if (!inputPath) {
  console.error('Uso: node --experimental-strip-types apps/api/scripts/build-catalog-sql.ts <catalog.json> [salida.sql] [--no-transaction]');
  process.exit(1);
}

const payload = JSON.parse((await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''));
const records = catalogRecordsFromJson(payload, { defaultSource: 'supermercados-espana', fallbackCategory: 'Supermercado' });
const catalog = normalizeCatalogImport(records, { defaultSource: 'supermercados-espana' });
await writeFile(outputPath, buildCatalogImportSql(catalog, { transaction: !noTransaction }), 'utf8');
console.log(`SQL generado: ${outputPath}`);
console.log(`Categorias: ${catalog.categories.length}`);
console.log(`Productos: ${catalog.products.length}`);
console.log(`Aliases: ${catalog.aliases.length}`);
