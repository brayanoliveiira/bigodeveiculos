"""
E2E de placa em maiúsculo, vendas parceladas/a prazo, recebimentos e relatórios gerenciais.
Servidor com ADMIN_USER=brayan / ADMIN_PASSWORD=senha-do-brayan. Uso: BASE=http://localhost:3456 python3 tests/e2e/reports.py
"""
import os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3456")
SHOTS = os.environ.get("SHOTS", "/tmp/e2e")
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1200, "height": 900}, accept_downloads=True)
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.set_default_timeout(8000)

    page.goto(BASE)
    page.fill("#lu", "brayan"); page.fill("#lp", "senha-do-brayan"); page.click("#lgo")
    expect(page.locator(".who")).to_contain_text("Brayan")

    # 1) placa sempre em maiúsculo (digitando minúsculo) e investido por sócio antes de vender
    page.click("[data-go=carros]"); page.click("[data-act=new-car]")
    page.fill("#f_name", "Chevrolet Prisma 2017"); page.type("#f_placa", "pri1a23")
    expect(page.locator("#f_placa")).to_have_value("PRI1A23")
    page.fill("#f_entT", "40000"); page.fill("#f_ovrA", "15000"); page.fill("#f_anun", "52000")
    page.click("#fsave")
    card = page.locator(".card", has_text="Prisma")
    expect(card).to_contain_text("PRI1A23")
    expect(card).to_contain_text("Investido")
    expect(card).to_contain_text("R$ 15.000,00")
    expect(card).to_contain_text("R$ 25.000,00")
    # gasto pago por Marcos aumenta o investido dele antes da venda
    page.click("[data-go=gastos]"); page.click("[data-act=new-exp]")
    page.select_option("#f_carId", label="Chevrolet Prisma 2017"); page.fill("#f_valor", "2000"); page.select_option("#f_cat", "Peças"); page.select_option("#f_quem", "B"); page.fill("#f_desc", "Pastilhas e discos")
    page.click("#fsave")
    page.click("[data-go=resumo]")
    expect(page.locator("#view")).to_contain_text("Investido por sócio")
    expect(page.locator("#view")).to_contain_text("R$ 27.000,00")   # Marcos: 25.000 + 2.000 em estoque

    # 2) vender parcelado: carro vendido por 60.000, programar entrada de 20.000 + 5x
    page.click("[data-go=carros]"); page.click(".card:has-text('Prisma') [data-act=edit-car]")
    page.select_option("#f_status", "Vendido"); page.fill("#f_vvenda", "60000"); page.fill("#f_comprador", "Cliente Parcelado")
    page.click("#fsave")
    page.click("[data-go=vendas]")
    row = page.locator("tbody tr", has_text="Prisma")
    expect(row).to_contain_text("À vista")   # ainda sem parcelas = tratado como recebido
    row.locator("[data-act=receipts]").click()
    expect(page.locator(".rc-sum")).to_be_visible()
    page.click("[data-act=rc-plan]")
    page.select_option("#pl_mode", "parcelado"); page.fill("#pl_ent", "20000"); page.select_option("#pl_n", "5")
    expect(page.locator("#pl_prev")).to_contain_text("Entrada")
    expect(page.locator("#pl_prev")).to_contain_text("5/5")
    expect(page.locator("#pl_prev tfoot")).to_contain_text("R$ 60.000,00")
    page.screenshot(path=f"{SHOTS}/07-plano.png")
    page.click("#fsave")
    expect(page.locator(".rc-sum")).to_contain_text("R$ 20.000,00")      # recebido (entrada)
    expect(page.locator(".sheet")).to_contain_text("1/5")
    # receber a 1ª parcela
    page.locator("tbody tr", has_text="1/5").locator("[data-act=rc-pay]").click()
    page.click("#fsave")
    expect(page.locator(".sheet")).to_contain_text("Recebido")
    page.screenshot(path=f"{SHOTS}/08-recebimentos.png")
    page.click(".sheet [data-x=cancel]")
    expect(page.locator("tbody tr", has_text="Prisma")).to_contain_text("Parcelado")

    # 3) exemplos para popular os relatórios
    page.click("[data-go=ajustes]"); page.click("[data-act=examples]"); page.wait_for_selector("[data-act=rm-examples]")
    page.click("[data-go=vendas]")
    try:
        expect(page.locator("tbody")).to_contain_text("Sandero")
    except AssertionError:
        print("VIEW:", page.inner_text("#view")[:500]); print("ERRS:", errors); page.screenshot(path=f"{SHOTS}/fail.png"); raise
    page.click("[data-vf=Atrasadas]")
    expect(page.locator("tbody")).to_contain_text("Sandero")
    expect(page.locator("tbody")).not_to_contain_text("HB20")
    page.click("[data-vf=Quitadas]")
    expect(page.locator("tbody")).to_contain_text("HB20")
    page.screenshot(path=f"{SHOTS}/09-vendas.png", full_page=True)

    # 4) relatórios gerenciais: abre todos, período "Tudo", sem erro
    page.click("[data-go=gerencial]")
    page.select_option("#per", "tudo")
    for key, text in [("geral", "Resumo por sócio"), ("socios", "Capital investido em cada carro do estoque"), ("lucro", "Tabela mensal"), ("caixa", "Agenda de recebimentos"),
                      ("vendas", "Vendas por forma de pagamento"), ("estoque", "Envelhecimento do estoque"), ("gastos", "Por categoria"), ("ranking", "Desempenho por carro")]:
        page.click(f"[data-rep={key}]")
        expect(page.locator("#rep")).to_contain_text(text)
        page.screenshot(path=f"{SHOTS}/rep-{key}.png", full_page=True)
    page.click("[data-rep=lucro]")
    expect(page.locator("#rep svg.chart")).to_be_visible()
    expect(page.locator("#rep")).to_contain_text("Brayan")
    expect(page.locator("#rep")).to_contain_text("Marcos")

    # 5) exportar CSV
    page.click("[data-rep=caixa]")
    with page.expect_download() as dl:
        page.locator("[data-act=csv]").first.click()
    path = dl.value.path()
    raw = open(path, "rb").read()
    assert raw.startswith(b"\xef\xbb\xbf"), "CSV sem BOM"
    txt = raw.decode("utf-8-sig")
    assert ";" in txt and "Mês" in txt.splitlines()[0], txt[:200]

    # 6) período personalizado sem vendas mostra vazio sem quebrar
    page.click("[data-rep=ranking]")
    page.select_option("#per", "custom"); page.fill("#pfrom", "2001-01-01"); page.fill("#pto", "2001-12-31")
    expect(page.locator("#rep")).to_contain_text("Sem dados no período")
    b.close()

if errors:
    print("ERROS NO NAVEGADOR:"); [print(" -", e) for e in errors]; sys.exit(1)
print("e2e reports ok")
