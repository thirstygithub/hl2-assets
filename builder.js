const fs = require('fs');

let index = fs.readFileSync('index.html', 'utf8');
let launcher = fs.readFileSync('hl2_launcher.js', 'utf8');

// Commit SHA after splitting bootstrap
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/thirstygithub/hl2-assets@8781453/';


// Both data files use the same loadMap function: xhr.open("GET", `chunks/${mapName}.data`, true)
// Patch engine to fetch chunks from split_data/ and stitch them in memory
// We replace the entire loadMap XHR block with a fetch-based stitcher
const originalXhrBlock = 'xhr.open("GET", `chunks/${mapName}.data`, true);\n    xhr.send();\n    return promise;';
const patchedFetchBlock = `
    // Chunked fetch to bypass jsDelivr 20MB file limit
    const chunkMap = {
      'bootstrap': ['split_data/bootstrap.data.part0','split_data/bootstrap.data.part1','split_data/bootstrap.data.part2'],
      'background01': ['split_data/background01.data.part0','split_data/background01.data.part1','split_data/background01.data.part2','split_data/background01.data.part3','split_data/background01.data.part4','split_data/background01.data.part5','split_data/background01.data.part6','split_data/background01.data.part7','split_data/background01.data.part8','split_data/background01.data.part9','split_data/background01.data.part10','split_data/background01.data.part11','split_data/background01.data.part12']
    };
    const parts = chunkMap[mapName];
    if (parts) {
      let loaded = 0;
      window.updateProgress && window.updateProgress(5);
      Promise.all(parts.map(p =>
        fetch(p).then(r => r.arrayBuffer()).then(buf => {
          loaded++;
          window.updateProgress && window.updateProgress(5 + (loaded / parts.length) * 85);
          console.log('[HL2] ' + mapName + ' chunk ' + loaded + '/' + parts.length);
          return buf;
        })
      )).then(buffers => {
        const total = buffers.reduce((a, b) => a + b.byteLength, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const b of buffers) { out.set(new Uint8Array(b), off); off += b.byteLength; }
        window.updateProgress && window.updateProgress(100);
        Object.defineProperty(xhr, 'response', { value: out.buffer });
        Object.defineProperty(xhr, 'readyState', { value: 4 });
        Object.defineProperty(xhr, 'status', { value: 200 });
        if (xhr.onprogress) xhr.onprogress({ lengthComputable: true, loaded: total, total });
        if (xhr.onreadystatechange) xhr.onreadystatechange();
        if (xhr.onload) xhr.onload();
      }).catch(err => {
        console.error('[HL2] chunk load failed for ' + mapName, err);
        if (xhr.onerror) xhr.onerror(err);
      });
    } else {
      xhr.open("GET", \`split_data/\${mapName}.data\`, true);
      xhr.send();
    }
    return promise;`;

launcher = launcher.replace(originalXhrBlock, () => patchedFetchBlock);

const interceptorCode = `
    <script src="coi-serviceworker.js"></script>
    <base href="${CDN_BASE}">
    <style>
        #custom-loader {
            position: fixed;
            bottom: 0; left: 0;
            width: 100%; height: 6px;
            background: #111;
            z-index: 9999;
            pointer-events: none;
        }
        #custom-loader-bar {
            width: 0%; height: 100%;
            background: #fff;
            transition: width 0.2s linear;
        }
    </style>
    <script>
        window.updateProgress = function(percent) {
            const bar = document.getElementById('custom-loader-bar');
            if (bar) bar.style.width = Math.min(100, Math.max(0, percent)) + '%';
            if (percent >= 100) {
                setTimeout(() => {
                    const loader = document.getElementById('custom-loader');
                    if (loader) loader.style.display = 'none';
                }, 800);
            }
        };

        // Blob worker trick to bypass cross-origin worker restriction
        const originalWorker = window.Worker;
        window.Worker = function(url, options) {
            let urlStr = String(url);
            if (urlStr.startsWith('http') && !urlStr.startsWith(window.location.origin)) {
                console.log('[HL2] Proxying worker via blob:', urlStr);
                const blob = new Blob(["importScripts('" + urlStr + "');"], { type: 'application/javascript' });
                return new originalWorker(URL.createObjectURL(blob), options);
            }
            return new originalWorker(url, options);
        };
    </script>
`;

index = index.replace('<head>', () => '<head>\n' + interceptorCode);

const loaderHtml = '<div id="custom-loader"><div id="custom-loader-bar"></div></div>';
index = index.replace('<body>', () => '<body>\n' + loaderHtml);

index = index.replace(
    'var Module = {',
    () => `var Module = { mainScriptUrlOrBlob: "${CDN_BASE}hl2_launcher.js", setStatus: function(text) { if(text) console.log('[HL2]', text); },`
);

index = index.replace(
    '<script async type="text/javascript" src="hl2_launcher.js"></script>',
    () => '<script>\n' + launcher + '\n</script>'
);

fs.writeFileSync('hl2-single.html', index);
console.log('Done! Checking patch...');
console.log('chunks/ still in file?', fs.readFileSync('hl2-single.html', 'utf8').includes('chunks/'));
