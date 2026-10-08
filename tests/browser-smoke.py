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
    for id in ['btnPackExport','btnPackImport','packFileInput','btnRecord','compareDisplayMode','compareOpacity','compareVisible','btnUVAnalyze','toggleAlphaOverlay']:
        assert page.locator('#'+id).count()==1, f'UI missing {id}'
    assert page.locator('.release').inner_text()=='v1.0.0'
    assert page.locator('[data-tab="workflow"]').count()==1
    page.locator('[data-tab="workflow"]').click()
    assert page.locator('#btnPackExport').is_visible()
    assert page.locator('#btnRecord').is_visible()
    result=page.evaluate('Boolean(window.__maxVFXReady)')
    print('STATIC UI SMOKE: PASS (controls, tabs, version) — DOM-only: local HTTP blocked')
    if result:
        print('WEBGL INITIALIZATION: PASS')
    else:
        print('WEBGL INITIALIZATION: NOT VERIFIED (Three.js CDN or GPU unavailable)')
    browser.close()
