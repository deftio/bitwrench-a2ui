// Gallery entries: one small surface per basic catalog component. Shared by the gallery
// page and the fixtures test, which renders every entry and checks for errors.
(function () {
  'use strict';
  const fmt = value => ({ '@call': 'formatString', args: { value } });
  const img = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#ccfbf1"/><circle cx="90" cy="80" r="34" fill="#0f766e"/><path d="M0 180 L120 90 L200 150 L250 110 L320 170 V180 Z" fill="#115e59"/></svg>');

  const GALLERY = [
    { name: 'Text', group: 'Display', note: 'Markdown subset; raw HTML stays text.', components: [
      { id: 'root', component: 'Column', children: ['a', 'b'] },
      { id: 'a', component: 'Text', text: '### Heading\nSome *emphasis*, **strong** and `code`.\n\n- one\n- two' },
      { id: 'b', component: 'Text', variant: 'caption', text: 'A caption. <b>not bold</b>' }] },
    { name: 'Image', group: 'Display', note: 'fit and variant; URLs go through the media policy.', components: [
      { id: 'root', component: 'Row', align: 'center', children: ['a', 'b'] },
      { id: 'a', component: 'Image', url: img, description: 'Landscape', variant: 'smallFeature', fit: 'cover' },
      { id: 'b', component: 'Image', url: img, description: 'Avatar', variant: 'avatar', fit: 'cover' }] },
    { name: 'Icon', group: 'Display', note: '59 Material Symbols names, or an svgPath.', components: [
      { id: 'root', component: 'Row', align: 'center', children: ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'] },
      ...['home', 'search', 'mail', 'favorite', 'settings', 'shoppingCart', 'warning'].map((name, i) => ({ id: `i${i + 1}`, component: 'Icon', name }))] },
    { name: 'Video', group: 'Display', note: 'Native video with controls; poster image.', components: [
      { id: 'root', component: 'Video', url: 'https://example.invalid/video.mp4', posterUrl: img }] },
    { name: 'AudioPlayer', group: 'Display', note: 'Native audio with a caption.', components: [
      { id: 'root', component: 'AudioPlayer', url: 'https://example.invalid/episode.mp3', description: 'Episode 12: Agents and interfaces' }] },
    { name: 'Divider', group: 'Display', note: 'Horizontal or vertical.', components: [
      { id: 'root', component: 'Column', children: ['t1', 'd', 'r'] },
      { id: 't1', component: 'Text', text: 'Above' }, { id: 'd', component: 'Divider' },
      { id: 'r', component: 'Row', align: 'center', children: ['l', 'v', 'rr'] },
      { id: 'l', component: 'Text', text: 'Left' }, { id: 'v', component: 'Divider', axis: 'vertical' }, { id: 'rr', component: 'Text', text: 'Right' }] },
    { name: 'Row', group: 'Layout', note: 'justify, align, and child weight.', components: [
      { id: 'root', component: 'Row', justify: 'spaceBetween', align: 'center', children: ['a', 'b', 'c'] },
      { id: 'a', component: 'Text', text: '**weight 1**', weight: 1 }, { id: 'b', component: 'Text', text: '**weight 2**', weight: 2 }, { id: 'c', component: 'Icon', name: 'arrowForward' }] },
    { name: 'Column', group: 'Layout', note: 'Vertical layout; containers add no padding.', components: [
      { id: 'root', component: 'Column', align: 'center', children: ['a', 'b', 'c'] },
      { id: 'a', component: 'Text', text: 'One' }, { id: 'b', component: 'Text', text: 'Two' }, { id: 'c', component: 'Text', text: 'Three' }] },
    { name: 'List', group: 'Layout', note: 'Children from a data array with a template.', data: { fruit: [{ n: 'Apple', p: 1.2 }, { n: 'Pear', p: 0.9 }, { n: 'Fig', p: 2.5 }] }, components: [
      { id: 'root', component: 'List', children: { componentId: 'row', path: '/fruit' } },
      { id: 'row', component: 'Row', justify: 'spaceBetween', children: ['name', 'price'] },
      { id: 'name', component: 'Text', text: fmt('${@index(offset: 1)}. ${n}') },
      { id: 'price', component: 'Text', text: { '@call': 'formatCurrency', args: { value: { '@path': 'p' }, currency: 'EUR' } } }] },
    { name: 'Card', group: 'Layout', note: 'bitwrench makeCard with one child.', components: [
      { id: 'root', component: 'Card', child: 't' }, { id: 't', component: 'Text', text: '**A card**\nWith one child.' }] },
    { name: 'Tabs', group: 'Layout', note: 'Only the selected tab is mounted; arrow keys move between tabs.', components: [
      { id: 'root', component: 'Tabs', tabs: [{ title: 'Overview', child: 'a' }, { title: 'Details', child: 'b' }, { title: 'Reviews', child: 'c' }] },
      { id: 'a', component: 'Text', text: 'Overview content.' }, { id: 'b', component: 'Text', text: 'Details content.' }, { id: 'c', component: 'Text', text: '★★★★☆ Reviews content.' }] },
    { name: 'Modal', group: 'Layout', note: 'Focus moves into the dialog and returns to the trigger.', components: [
      { id: 'root', component: 'Modal', trigger: 'btn', content: 'body' },
      { id: 'btn', component: 'Button', child: 'bl', action: { event: { name: 'open' } } }, { id: 'bl', component: 'Text', text: 'Open dialog' },
      { id: 'body', component: 'Column', children: ['h', 'f'] }, { id: 'h', component: 'Text', text: '### A dialog' }, { id: 'f', component: 'TextField', label: 'Try typing', value: '' }] },
    { name: 'Button', group: 'Inputs', note: 'default, primary, borderless; disabled while checks fail.', components: [
      { id: 'root', component: 'Row', align: 'center', children: ['a', 'b', 'c'] },
      { id: 'a', component: 'Button', child: 'al', action: { event: { name: 'a' } } }, { id: 'al', component: 'Text', text: 'Default' },
      { id: 'b', component: 'Button', variant: 'primary', child: 'bl', action: { event: { name: 'b' } } }, { id: 'bl', component: 'Text', text: 'Primary' },
      { id: 'c', component: 'Button', variant: 'borderless', child: 'cl', action: { event: { name: 'c' } } }, { id: 'cl', component: 'Row', align: 'center', children: ['ci', 'ct'] },
      { id: 'ci', component: 'Icon', name: 'share' }, { id: 'ct', component: 'Text', text: 'Borderless' }] },
    { name: 'TextField', group: 'Inputs', note: 'Two-way binding, variants and validation.', data: { email: 'not-an-email', bio: '' }, components: [
      { id: 'root', component: 'Column', children: ['e', 'pw', 'n', 'bio'] },
      { id: 'e', component: 'TextField', label: 'Email', value: { '@path': '/email' }, '@checks': [{ condition: { '@call': 'email', args: { value: { '@path': '/email' } } }, message: 'Please enter a valid email.' }] },
      { id: 'pw', component: 'TextField', label: 'Password', variant: 'obscured', value: '' },
      { id: 'n', component: 'TextField', label: 'Quantity', variant: 'number', value: '3' },
      { id: 'bio', component: 'TextField', label: 'Bio', variant: 'longText', placeholder: 'Tell us about you', value: { '@path': '/bio' } }] },
    { name: 'CheckBox', group: 'Inputs', note: 'Boolean two-way binding.', data: { ok: true }, components: [
      { id: 'root', component: 'Column', children: ['c', 't'] },
      { id: 'c', component: 'CheckBox', label: 'Subscribe to updates', value: { '@path': '/ok' } },
      { id: 't', component: 'Text', variant: 'caption', text: fmt('value: ${/ok}') }] },
    { name: 'ChoicePicker', group: 'Inputs', note: 'Single or multiple; checkbox or chips; filterable.', data: { one: ['b'], many: ['r'] }, components: [
      { id: 'root', component: 'Column', children: ['a', 'b'] },
      { id: 'a', component: 'ChoicePicker', label: 'Size', options: [{ label: 'Small', value: 's' }, { label: 'Medium', value: 'b' }, { label: 'Large', value: 'l' }], value: { '@path': '/one' } },
      { id: 'b', component: 'ChoicePicker', label: 'Colors', variant: 'multipleSelection', displayStyle: 'chips', filterable: true,
        options: [{ label: 'Red', value: 'r' }, { label: 'Green', value: 'g' }, { label: 'Blue', value: 'u' }, { label: 'Amber', value: 'a' }], value: { '@path': '/many' } }] },
    { name: 'Slider', group: 'Inputs', note: 'min, max, steps; value shown.', data: { v: 40 }, components: [
      { id: 'root', component: 'Slider', label: 'Volume', min: 0, max: 100, steps: 10, value: { '@path': '/v' } }] },
    { name: 'DateTimeInput', group: 'Inputs', note: 'Native date, time or datetime-local, ISO 8601 values.', data: { d: '2026-12-24', t: '18:30', dt: '2026-12-31T23:59' }, components: [
      { id: 'root', component: 'Column', children: ['d', 't', 'dt'] },
      { id: 'd', component: 'DateTimeInput', label: 'Date', enableDate: true, value: { '@path': '/d' } },
      { id: 't', component: 'DateTimeInput', label: 'Time', enableTime: true, value: { '@path': '/t' } },
      { id: 'dt', component: 'DateTimeInput', label: 'Date and time', enableDate: true, enableTime: true, value: { '@path': '/dt' } }] },
  ];

  window.A2UI_GALLERY = GALLERY;
})();
