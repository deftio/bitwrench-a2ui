// Phase 0 spike: the exact set of web_core names the adapter plans to use.
// Bundled by run.js to check that Lit is tree-shaken out and that no eval paths remain.
//
// Component schemas come from the official v1.0 catalog document via Catalog.fromJson,
// NOT from TextApi/ButtonApi/...: those are re-exported through web_core's components
// barrel, which instantiates the Lit elements at module load and so drags Lit into
// any bundle (see dev/spike/RESULTS.md).
import {
  MessageProcessor,
  NodeResolver,
  Catalog,
  effect,
  getValue,
  BASIC_FUNCTIONS,
} from '@a2ui/web_core/v1_0';
import catalogJson from './upstream/basic_catalog_v1.json' with { type: 'json' };

export const BASIC_CATALOG_ID = catalogJson.catalogId;

// Pair each upstream component schema with our own implementation.
export function makeBasicCatalog(implFor = () => ({})) {
  const schemaOnly = Catalog.fromJson(catalogJson, '1.0');
  const components = [...schemaOnly.components.values()].map(api => ({ ...api, ...implFor(api.name) }));
  return new Catalog(BASIC_CATALOG_ID, '1.0', components, BASIC_FUNCTIONS);
}

export { MessageProcessor, NodeResolver, effect, getValue };
