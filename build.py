"""Build the installable XPI with only the four runtime files."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parent
FILES = ("manifest.json", "bootstrap.js", "progress.js", "style.css")

def build():
    version = json.loads((ROOT / "src/manifest.json").read_text(encoding="utf-8"))["version"]
    target = ROOT / "dist" / f"zotero-reading-progress-{version}.xpi"
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(ROOT / "src" / name, name)
    with zipfile.ZipFile(target) as archive:
        assert sorted(archive.namelist()) == sorted(FILES)
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["applications"]["zotero"]["strict_max_version"] == "10.0.*"
    print(target)
    return target

if __name__ == "__main__":
    build()
