// Demo A2UI v1.0 message sets used across the site (home page, playground presets,
// examples). Each fixture has `messages` (sent at once) or `stream` (sent over time),
// and optionally `respond(action)`, a scripted reply used by the simulated agent.
(function () {
  'use strict';
  const CAT = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
  const V = '1.0';
  const create = (surfaceId, components, dataModel, extra = {}) => ({ version: V, createSurface: { surfaceId, catalogId: CAT, components, ...(dataModel ? { dataModel } : {}), ...extra } });
  const update = (surfaceId, components) => ({ version: V, updateComponents: { surfaceId, components } });
  const data = (surfaceId, path, value) => ({ version: V, updateDataModel: { surfaceId, path, value } });
  const fmt = value => ({ '@call': 'formatString', args: { value } });
  const avatar = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#0f766e"/><text x="48" y="60" font-size="40" text-anchor="middle" fill="#fff" font-family="sans-serif">AL</text></svg>');
  const banner = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="600" height="200" fill="url(#g)"/><text x="300" y="115" font-size="36" text-anchor="middle" fill="#fff" font-family="sans-serif">Harbor Bistro</text></svg>');

  const FIXTURES = [
    {
      id: 'hello',
      title: 'Hello, A2UI',
      description: 'Text from the data model, a two-way TextField and a Button action.',
      messages: [create('hello', [
        { id: 'root', component: 'Card', child: 'col' },
        { id: 'col', component: 'Column', children: ['greeting', 'name', 'go'] },
        { id: 'greeting', component: 'Text', text: fmt('## Hello, ${/name}!\nType a name and press the button.') },
        { id: 'name', component: 'TextField', label: 'Your name', value: { '@path': '/name' }, placeholder: 'Ada Lovelace' },
        { id: 'go', component: 'Button', child: 'goLabel', variant: 'primary', action: { event: { name: 'greet', context: { name: { '@path': '/name' } } } } },
        { id: 'goLabel', component: 'Text', text: 'Say hello' },
      ], { name: 'Ada' })],
      respond: a => a.name === 'greet' ? [data('hello', '/name', `${a.context.name} 👋`)] : [],
    },
    {
      id: 'booking',
      title: 'Table booking form',
      description: 'Inputs with validation checks; the Book button stays disabled until the form is valid.',
      messages: [create('booking', [
        { id: 'root', component: 'Card', child: 'form' },
        { id: 'form', component: 'Column', children: ['hero', 'title', 'who', 'when', 'guests', 'seating', 'notes', 'terms', 'book'] },
        { id: 'hero', component: 'Image', url: banner, description: 'Harbor Bistro', variant: 'header', fit: 'cover' },
        { id: 'title', component: 'Text', text: '### Book a table\nWe hold tables for 15 minutes.' },
        { id: 'who', component: 'Row', children: ['name', 'email'] },
        { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/b/name' }, weight: 1,
          '@checks': [{ condition: { '@call': 'required', args: { value: { '@path': '/b/name' } } }, message: 'Please enter your name.' }] },
        { id: 'email', component: 'TextField', label: 'Email', value: { '@path': '/b/email' }, weight: 1,
          '@checks': [{ condition: { '@call': 'email', args: { value: { '@path': '/b/email' } } }, message: 'Please enter a valid email address.' }] },
        { id: 'when', component: 'DateTimeInput', label: 'Date and time', enableDate: true, enableTime: true, value: { '@path': '/b/when' } },
        { id: 'guests', component: 'Slider', label: fmt('Guests: ${/b/guests}'), min: 1, max: 8, steps: 7, value: { '@path': '/b/guests' } },
        { id: 'seating', component: 'ChoicePicker', label: 'Seating', displayStyle: 'chips', options: [
          { label: 'Inside', value: 'inside' }, { label: 'Terrace', value: 'terrace' }, { label: 'Bar', value: 'bar' }], value: { '@path': '/b/seating' } },
        { id: 'notes', component: 'TextField', label: 'Notes', variant: 'longText', value: { '@path': '/b/notes' }, placeholder: 'Allergies, occasions...' },
        { id: 'terms', component: 'CheckBox', label: 'I accept the cancellation policy', value: { '@path': '/b/terms' } },
        { id: 'book', component: 'Button', child: 'bookLabel', variant: 'primary',
          action: { event: { name: 'book', userMessage: 'Book this table', context: { booking: { '@path': '/b' } } } },
          '@checks': [
            { condition: { '@call': 'required', args: { value: { '@path': '/b/name' } } }, message: 'Name is required.' },
            { condition: { '@call': 'email', args: { value: { '@path': '/b/email' } } }, message: 'Email is invalid.' },
            { condition: { '@path': '/b/terms' }, message: 'Please accept the policy.' },
          ] },
        { id: 'bookLabel', component: 'Text', text: 'Book table' },
      ], { b: { name: '', email: '', when: '2026-12-05T19:30', guests: 2, seating: ['inside'], notes: '', terms: false } })],
      respond: a => a.name !== 'book' ? [] : [update('booking', [
        { id: 'root', component: 'Card', child: 'done' },
        { id: 'done', component: 'Column', children: ['ok', 'sum', 'icons'] },
        { id: 'ok', component: 'Text', text: fmt('### You are booked, ${/b/name}!') },
        { id: 'sum', component: 'Text', text: fmt('Table for **${/b/guests}** on ${formatDate(value: ${/b/when}, format: \'EEEE d MMMM, HH:mm\')}. A confirmation is on its way to ${/b/email}.') },
        { id: 'icons', component: 'Row', align: 'center', children: ['i1', 'i2'] },
        { id: 'i1', component: 'Icon', name: 'check' },
        { id: 'i2', component: 'Text', text: 'Simulated agent reply', variant: 'caption' },
      ])],
    },
    {
      id: 'dashboard',
      title: 'Orders dashboard',
      description: 'Rows of cards with icons, a list rendered from a data array, and tabs.',
      messages: [create('dash', [
        { id: 'root', component: 'Column', children: ['stats', 'tabs'] },
        { id: 'stats', component: 'Row', children: ['c1', 'c2', 'c3'] },
        { id: 'c1', component: 'Card', child: 'c1b', weight: 1 }, { id: 'c1b', component: 'Row', align: 'center', children: ['c1i', 'c1t'] },
        { id: 'c1i', component: 'Icon', name: 'shoppingCart' }, { id: 'c1t', component: 'Text', text: fmt('**${/stats/orders}** orders today') },
        { id: 'c2', component: 'Card', child: 'c2b', weight: 1 }, { id: 'c2b', component: 'Row', align: 'center', children: ['c2i', 'c2t'] },
        { id: 'c2i', component: 'Icon', name: 'payment' }, { id: 'c2t', component: 'Text', text: { '@call': 'formatCurrency', args: { value: { '@path': '/stats/revenue' }, currency: 'USD' } } },
        { id: 'c3', component: 'Card', child: 'c3b', weight: 1 }, { id: 'c3b', component: 'Row', align: 'center', children: ['c3i', 'c3t'] },
        { id: 'c3i', component: 'Icon', name: 'star' }, { id: 'c3t', component: 'Text', text: fmt('**${/stats/rating}** average rating') },
        { id: 'tabs', component: 'Tabs', tabs: [{ title: 'Recent orders', child: 'list' }, { title: 'Notes', child: 'notes' }] },
        { id: 'list', component: 'List', children: { componentId: 'row', path: '/orders' } },
        { id: 'row', component: 'Row', justify: 'spaceBetween', align: 'center', children: ['rowName', 'rowTotal'] },
        { id: 'rowName', component: 'Text', text: fmt('${@index(offset: 1)}. ${customer}') },
        { id: 'rowTotal', component: 'Text', text: { '@call': 'formatCurrency', args: { value: { '@path': 'total' }, currency: 'USD' } } },
        { id: 'notes', component: 'Text', text: '- Restock oat milk\n- Terrace opens Friday\n- Staff meeting at `9:00`' },
      ], { stats: { orders: 42, revenue: 1834.5, rating: 4.7 }, orders: [{ customer: 'Grace', total: 41.2 }, { customer: 'Linus', total: 18 }, { customer: 'Barbara', total: 63.75 }] })],
    },
    {
      id: 'stream',
      title: 'Progressive stream',
      description: 'The layout arrives first, children and data stream in afterwards and upgrade in place.',
      stream: [
        { delay: 0, messages: [create('live', [{ id: 'root', component: 'Card', child: 'col' }, { id: 'col', component: 'Column', children: ['h', 'p', 'steps', 'bar'] }], { pct: 0, items: [] })] },
        { delay: 500, messages: [update('live', [{ id: 'h', component: 'Text', text: '### Planning your trip' }])] },
        { delay: 500, messages: [update('live', [{ id: 'p', component: 'Text', text: 'The agent is gathering options. Components appear as they arrive.', variant: 'caption' }])] },
        { delay: 500, messages: [update('live', [{ id: 'bar', component: 'Slider', label: fmt('Progress ${/pct}%'), max: 100, value: { '@path': '/pct' } }])] },
        { delay: 400, messages: [update('live', [{ id: 'steps', component: 'List', children: { componentId: 'step', path: '/items' } }, { id: 'step', component: 'Row', align: 'center', children: ['stepIcon', 'stepText'] }, { id: 'stepIcon', component: 'Icon', name: 'check' }, { id: 'stepText', component: 'Text', text: { '@path': 'label' } }])] },
        { delay: 500, messages: [data('live', '/items', [{ label: 'Flights compared' }]), data('live', '/pct', 30)] },
        { delay: 500, messages: [data('live', '/items/1', { label: 'Hotels shortlisted' }), data('live', '/pct', 65)] },
        { delay: 500, messages: [data('live', '/items/2', { label: 'Itinerary drafted' }), data('live', '/pct', 100)] },
      ],
    },
    {
      id: 'profile',
      title: 'Profile with a modal',
      description: 'An avatar image, a modal dialog with an edit form, and a checkbox.',
      messages: [create('profile', [
        { id: 'root', component: 'Card', child: 'col' },
        { id: 'col', component: 'Column', children: ['top', 'div', 'about', 'actions'] },
        { id: 'top', component: 'Row', align: 'center', children: ['pic', 'who'] },
        { id: 'pic', component: 'Image', url: avatar, variant: 'avatar', description: 'Ada Lovelace' },
        { id: 'who', component: 'Text', text: fmt('### ${/p/name}\n${/p/role}') },
        { id: 'div', component: 'Divider' },
        { id: 'about', component: 'Text', text: { '@path': '/p/bio' } },
        { id: 'actions', component: 'Row', children: ['edit', 'notify'] },
        { id: 'edit', component: 'Modal', trigger: 'editBtn', content: 'editForm' },
        { id: 'editBtn', component: 'Button', child: 'editLabel', action: { event: { name: 'openEditor' } } },
        { id: 'editLabel', component: 'Row', align: 'center', children: ['editIcon', 'editText'] },
        { id: 'editIcon', component: 'Icon', name: 'edit' }, { id: 'editText', component: 'Text', text: 'Edit profile' },
        { id: 'editForm', component: 'Column', children: ['fName', 'fRole', 'fBio'] },
        { id: 'fName', component: 'TextField', label: 'Name', value: { '@path': '/p/name' } },
        { id: 'fRole', component: 'TextField', label: 'Role', value: { '@path': '/p/role' } },
        { id: 'fBio', component: 'TextField', label: 'Bio', variant: 'longText', value: { '@path': '/p/bio' } },
        { id: 'notify', component: 'CheckBox', label: 'Email me about replies', value: { '@path': '/p/notify' } },
      ], { p: { name: 'Ada Lovelace', role: 'Analyst, Analytical Engine', bio: 'Writes the first published algorithm. Edits in the dialog update this card live.', notify: true } })],
    },
  ];

  window.A2UI_FIXTURES = { CAT, FIXTURES, create, update, data, fmt };
})();
