// Keep local browser requests on the UI origin, including when opened on a phone.
module.exports = {
  '/api/**': {
    target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8081',
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyRequest, request) => {
        // The development proxy makes LAN requests same-origin. Keep foreign
        // Origin headers intact so the API still checks cross-origin requests.
        const origin = request.headers.origin;
        if (origin) {
          try {
            const source = new URL(origin);
            if (['http:', 'https:'].includes(source.protocol) && source.host === request.headers.host) {
              proxyRequest.removeHeader('origin');
            }
          } catch {
            // Malformed origins are left for the API to reject.
          }
        }
      });
    },
  },
};
