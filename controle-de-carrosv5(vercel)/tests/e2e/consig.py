"""
Consignado e pagamentos parciais na tela. Servidor novo (admin brayan / senha-do-brayan).
Uso: BASE=http://localhost:3456 python3 tests/e2e/consig.py
"""
import os, re
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3456")
SHOTS = os.environ.get("SHOTS", "/tmp/e2e")
errors = []
os.makedirs(SHOTS, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1100, "height": 900})
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.set_default_timeout(8000)
    page.goto(BASE)
    page.fill("#lu", "brayan"); page.fill("#lp", "senha-do-brayan"); page.click("#lgo")
    expect(page.locator(".brand h1")).to_have_text("Bigodes Car")
    page.locator("[data-act=examples]").first.click(); page.wait_for_timeout(1500)
    page.click("[data-go=carros]")
    card = page.locator("article.card", has_text="consignado")
    expect(card).to_have_count(1)
    expect(card).to_contain_text("Consignado · Felipe")
    expect(card).to_contain_text("Comissão")
    card.screenshot(path=f"{SHOTS}/30-card-consig.png")
    card.locator("[data-act=repasses]").click()
    expect(page.locator(".rp-sum")).to_contain_text("Falta repassar")
    page.screenshot(path=f"{SHOTS}/31-repasses.png")
    page.click("[data-act=rep-new]")
    page.screenshot(path=f"{SHOTS}/32-repasse-form.png")
    page.keyboard.press("Escape")
    # recebimentos com parcela parcial (exemplo Sandero)
    page.reload(); page.click("[data-go=carros]")
    sand = page.locator("article.card", has_text="Sandero").first
    sand.locator("[data-act=receipts]").click()
    expect(page.locator("#modal")).to_contain_text("Pagou em parte")
    page.screenshot(path=f"{SHOTS}/33-recebimentos.png")
    page.locator("[data-act=rc-pay]").first.click()
    page.screenshot(path=f"{SHOTS}/34-registrar-pagamento.png")
    page.goto(BASE); page.click("[data-go=resumo]") if page.locator("[data-go=resumo]").count() else None
    page.screenshot(path=f"{SHOTS}/35-resumo.png", full_page=True)
    b.close()
print("ERROS:", errors or "nenhum")
