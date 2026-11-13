// Snapform embed: <div data-snapform="PUBLIC_ID"></div> plus this script.
(() => {
  const script = document.currentScript;
  const origin = new URL(script ? script.src : 'https://snapform.jacked.dev')
    .origin;
  const id =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const frames = [];
  const mount = () => {
    for (const host of document.querySelectorAll('[data-snapform]')) {
      const data = host.dataset;
      if (data.snapformReady || !id.test(data.snapform)) continue;
      data.snapformReady = '1';
      const frame = document.createElement('iframe');
      const url = new URL('/f/' + data.snapform, origin);
      url.searchParams.set('embed', '1');
      frame.title = data.snapformTitle || 'Form';
      frame.loading = 'lazy';
      frame.src = url.href;
      Object.assign(frame.style, {
        display: 'block',
        width: '100%',
        height: '600px',
        border: '0',
      });
      host.append(frame);
      frames.push(frame);
    }
  };
  // Only a frame this script created, served by Snapform, may set its height.
  addEventListener('message', (event) => {
    const frame = frames.find((item) => item.contentWindow === event.source);
    const data = event.data;
    if (
      frame &&
      event.source &&
      event.origin === origin &&
      data &&
      data.type === 'snapform:resize' &&
      Number.isFinite(data.height) &&
      data.height > 0 &&
      data.height <= 20000
    )
      frame.style.height = Math.ceil(data.height) + 'px';
  });
  mount();
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
})();
