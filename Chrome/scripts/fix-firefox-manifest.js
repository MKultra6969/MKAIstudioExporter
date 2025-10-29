import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const manifestPath = path.join(distPath, 'manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

if (manifest.background) {
  if (manifest.background.service_worker) {
    manifest.background.scripts = [manifest.background.service_worker.replace('.ts', '.js')];
    delete manifest.background.service_worker;
  }
  if (manifest.background.scripts) {
    manifest.background.scripts = manifest.background.scripts.map(s => s.replace('.ts', '.js'));
  }
}

if (manifest.content_scripts) {
  manifest.content_scripts.forEach(script => {
    script.js = script.js.map(file => file.replace('.ts', '.js'));
  });
}

manifest.browser_specific_settings = {
  gecko: {
    id: "mkaistudioexporter@mk69.su",
    strict_min_version: "109.0"
  }
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('✅ Firefox manifest fixed!');

/**
 * Google AI Studio Chat Exporter
 * Author: mkultra69
 * GitHub: https://github.com/MKultra6969
 * Website: https://mk69.su
 */