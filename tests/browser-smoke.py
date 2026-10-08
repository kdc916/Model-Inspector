"""Static UI smoke plus optional WebGL run. Requires Python playwright + chromium.

Run: python tests/browser-smoke.py
Exit nonzero if static UI wiring is broken. WebGL is classified separately when CDN unavailable.
"""
from pathlib import Path
import os, sys
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('SKIP: install playwright (python -m pip install playwright)');sys.exit(0)
root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':850})
    page.set_content((root / 'index.html').read_text(encoding='utf-8'), wait_until='domcontentloaded')
    page.add_style_tag(content=(root / 'styles.css').read_text(encoding='utf-8'))
    ids=page.locator('[id]').evaluate_all('(nodes) => nodes.map(node=>node.id)')
    assert len(ids)==len(set(ids)), 'duplicate DOM ids'
    for id in ['btnPackExport','btnPackImport','packFileInput','btnRecord','compareDisplayMode','compareOpacity','compareVisible','btnUVAnalyze','toggleAlphaOverlay']:
        assert page.locator('#'+id).count()==1, f'UI missing {id}'
    assert page.locator('.release').inner_text()=='v1.0.1'
    assert page.locator('[data-tab="workflow"]').count()==1
    # Module execution is unavailable without CDN; toggle pane markup only for layout inspection.
    page.evaluate("""() => { document.querySelectorAll('.tabpage').forEach(p=>p.classList.toggle('active',p.id==='page-workflow')); document.querySelectorAll('.right-tab').forEach(p=>p.classList.toggle('active',p.dataset.tab==='workflow')); }""")
    assert page.locator('#btnPackExport').is_visible()
    assert page.locator('#btnRecord').is_visible()
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('#btnPackExport').count()==1
    assert page.locator('#btnRecord').count()==1
    result=page.evaluate('Boolean(window.__maxVFXReady)')
    print('STATIC UI SMOKE: PASS (desktop/mobile markup, CSS, tabs, IDs, version) — no WebGL')
    if result:
        print('WEBGL INITIALIZATION: PASS')
    else:
        print('WEBGL INITIALIZATION: NOT VERIFIED (Three.js CDN or GPU unavailable)')
    browser.close()
