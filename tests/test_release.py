from pathlib import Path
import hashlib
import importlib.util
import json
import unittest
import zipfile

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release_script',root/'scripts/release.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReleaseTests(unittest.TestCase):
    def test_release_links_hash_and_saved_state_contract(self):
        xpi,updates=module.release('toms-3300/zotero-reading-progress','v1.1.0')
        data=json.loads(updates.read_text(encoding='utf-8'))
        entry=data['addons']['reading-progress@personal.local']['updates'][0]
        self.assertEqual(entry['update_hash'],'sha256:'+hashlib.sha256(xpi.read_bytes()).hexdigest())
        self.assertEqual(entry['update_link'],'https://github.com/toms-3300/zotero-reading-progress/releases/download/v1.1.0/zotero-reading-progress-1.1.0.xpi')
        with zipfile.ZipFile(xpi) as z:
            manifest=json.loads(z.read('manifest.json'))
            self.assertEqual(manifest['applications']['zotero']['id'],'reading-progress@personal.local')
            self.assertEqual(z.read('progress.js'),(root/'src/progress.js').read_bytes())
            self.assertEqual(len(z.namelist()),4)
    def test_mismatched_tag_is_rejected(self):
        with self.assertRaises(ValueError): module.release('toms-3300/zotero-reading-progress','v9.0.0')
    def test_wrong_repository_is_rejected(self):
        with self.assertRaises(ValueError): module.release('other/repository','v1.1.0')

if __name__=='__main__': unittest.main()
