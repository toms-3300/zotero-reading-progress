"""Build release assets and Zotero update metadata without network access."""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build import build

def release(repository, tag):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Expected owner/repository')
    manifest = json.loads((ROOT / 'src/manifest.json').read_text(encoding='utf-8'))
    app = manifest['applications']['zotero']
    version = manifest['version']
    if tag != 'v' + version:
        raise ValueError('Release tag must match manifest version: v' + version)
    expected = f'https://github.com/{repository}/releases/latest/download/updates.json'
    if app['update_url'] != expected:
        raise ValueError('manifest update_url does not match repository')
    xpi = build()
    update = {'version': version,
              'update_link': f'https://github.com/{repository}/releases/download/{tag}/{xpi.name}',
              'update_hash': 'sha256:' + hashlib.sha256(xpi.read_bytes()).hexdigest(),
              'applications': {'zotero': {key: app[key] for key in ('strict_min_version','strict_max_version')}}}
    output = ROOT / 'dist/updates.json'
    output.write_text(json.dumps({'addons':{app['id']:{'updates':[update]}}},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return xpi, output

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python scripts/release.py owner/repository v1.1.0')
    for asset in release(sys.argv[1], sys.argv[2]):
        print(asset)
