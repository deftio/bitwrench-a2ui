// Render A2UI messages to HTML in Node, with no browser.
//
//   node examples/static-export.mjs > order.html
//
// From an installed package, import from 'bitwrench-a2ui/static' instead.
import { renderToDocument } from '../src/static/index.js';

const CAT = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
const messages = [{
  version: '1.0',
  createSurface: {
    surfaceId: 'order', catalogId: CAT,
    dataModel: { order: { id: 'A-1042', items: [{ name: 'Espresso', qty: 2, price: 3.2 }, { name: 'Croissant', qty: 1, price: 2.8 }], total: 9.2 } },
    components: [
      { id: 'root', component: 'Card', child: 'col' },
      { id: 'col', component: 'Column', children: ['title', 'list', 'div', 'total'] },
      { id: 'title', component: 'Text', text: { '@call': 'formatString', args: { value: '### Order ${/order/id}' } } },
      { id: 'list', component: 'List', children: { componentId: 'line', path: '/order/items' } },
      { id: 'line', component: 'Row', justify: 'spaceBetween', children: ['what', 'cost'] },
      { id: 'what', component: 'Text', text: { '@call': 'formatString', args: { value: '${qty} × ${name}' } } },
      { id: 'cost', component: 'Text', text: { '@call': 'formatCurrency', args: { value: { '@path': 'price' }, currency: 'EUR' } } },
      { id: 'div', component: 'Divider' },
      { id: 'total', component: 'Text', text: { '@call': 'formatString', args: { value: '**Total: ${formatCurrency(value: ${/order/total}, currency: \'EUR\')}**' } } },
    ],
  },
}];

const { html, errors } = renderToDocument(messages, { title: 'Order A-1042', theme: 'forest' });
if (errors.length) console.error(errors);
process.stdout.write(html);
