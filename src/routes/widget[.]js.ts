import { createFileRoute } from "@tanstack/react-router";

// Serves /widget.js — a tiny loader that customers embed on their site.
// Usage:
//   <div id="traceium-crossover"></div>
//   <script src="https://<host>/widget.js" data-key="tcx_..." data-target="#traceium-crossover" async></script>

const SCRIPT = `(function(){
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-key');
  var target = script.getAttribute('data-target') || '#traceium-crossover';
  var height = script.getAttribute('data-height') || '760';
  var host = new URL(script.src).origin;
  var mount = document.querySelector(target);
  if (!mount) { console.error('[traceium] mount not found:', target); return; }
  var iframe = document.createElement('iframe');
  iframe.src = host + '/embed/crossover?key=' + encodeURIComponent(key || '');
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.height = height + 'px';
  iframe.loading = 'lazy';
  iframe.allow = 'clipboard-write';
  mount.appendChild(iframe);
})();`;

export const Route = createFileRoute("/widget[.]js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
