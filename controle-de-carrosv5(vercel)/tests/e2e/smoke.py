"""
Teste de ponta a ponta no navegador (Chromium + Playwright para Python).
Pré-requisito: o servidor rodando com um banco NOVO e ADMIN_USER=brayan / ADMIN_PASSWORD=senha-do-brayan.
Uso: BASE=http://localhost:3456 python3 tests/e2e/smoke.py
"""
import os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3456")
SHOTS = os.environ.get("SHOTS", "/tmp/e2e")
errors = []

def login(page, user, pw):
    page.goto(BASE)
    page.fill("#lu", user); page.fill("#lp", pw); page.click("#lgo")

with sync_playwright() as p:
    b = p.chromium.launch()
    def newpage(**kw):
        ctx = b.new_context(**kw)
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.set_default_timeout(8000)
        return ctx, pg

    # 1) login errado e certo
    ctx, page = newpage(viewport={"width": 1100, "height": 800})
    page.goto(BASE)
    expect(page.locator("#login")).to_be_visible()
    page.fill("#lu", "brayan"); page.fill("#lp", "errada"); page.click("#lgo")
    expect(page.locator("#lerr")).to_contain_text("incorretos")
    page.fill("#lp", "senha-do-brayan"); page.click("#lgo")
    expect(page.locator(".who")).to_contain_text("Brayan")
    expect(page.locator("#view")).to_contain_text("Nenhum carro ainda")
    page.screenshot(path=f"{SHOTS}/01-vazio.png")

    # 2) criar usuário Marcos em Ajustes
    page.click("[data-go=ajustes]")
    expect(page.locator("#users")).to_contain_text("brayan")
    page.click("[data-act=new-user]")
    page.fill("#u_name", "Marcos"); page.fill("#u_user", "marcos"); page.select_option("#u_role", "member"); page.fill("#u_pw", "senha-do-marcos")
    page.click("#sheet button[type=submit]")
    expect(page.locator("#users")).to_contain_text("marcos")

    # 3) carregar exemplos e ver o resumo
    page.click("[data-go=resumo]")
    page.click("[data-act=examples]")
    expect(page.locator(".kpi.hero")).to_be_visible()
    expect(page.locator("#view")).to_contain_text("Acerto entre sócios")
    page.screenshot(path=f"{SHOTS}/02-resumo.png", full_page=True)
    page.click("[data-go=ajustes]"); page.click("[data-act=rm-examples]"); page.click("#cyes")
    page.click("[data-go=carros]")
    expect(page.locator("#view")).to_contain_text("Nenhum carro cadastrado")

    # 4) Brayan cadastra um carro com entrada não-metade
    page.click("[data-act=new-car]")
    page.fill("#f_name", "Fiat Uno 2015"); page.fill("#f_placa", "UNO1A23")
    page.fill("#f_entT", "29.000,00"); page.fill("#f_ovrA", "9000")
    expect(page.locator("#entnote")).to_contain_text("R$ 20.000,00")
    page.select_option("#f_loc", "Oficina mecânica"); page.fill("#f_locdet", "Oficina do Carlos")
    page.click("#fsave")
    expect(page.locator(".card")).to_contain_text("Fiat Uno 2015")
    page.screenshot(path=f"{SHOTS}/03-carros.png")

    # 5) Marcos (outro navegador) entra, vê o carro e lança um gasto
    ctx2, m = newpage(viewport={"width": 390, "height": 800})
    login(m, "marcos", "senha-do-marcos")
    expect(m.locator(".who")).to_contain_text("Marcos")
    m.click("[data-go=carros]")
    expect(m.locator(".card")).to_contain_text("Fiat Uno 2015")
    m.click("[data-go=gastos]"); m.click("[data-act=new-exp]")
    m.select_option("#f_carId", label="Fiat Uno 2015"); m.fill("#f_valor", "850,50"); m.select_option("#f_cat", "Mecânica"); m.select_option("#f_quem", "B"); m.fill("#f_desc", "Revisão")
    m.click("#fsave")
    expect(m.locator("tbody")).to_contain_text("Revisão")
    m.screenshot(path=f"{SHOTS}/04-marcos-mobile.png")
    # Marcos (membro) não vê gestão de usuários
    m.click("[data-go=ajustes]")
    expect(m.locator("#view")).not_to_contain_text("Novo usuário")

    # 6) Brayan vê o gasto sem recarregar (atualização automática) e o histórico mostra quem fez
    page.click("[data-go=gastos]")
    expect(page.locator("tbody")).to_contain_text("Revisão", timeout=12000)
    page.click("[data-go=historico]")
    expect(page.locator(".entry").first).to_contain_text("Marcos")
    expect(page.locator("#list")).to_contain_text("Fiat Uno 2015")
    expect(page.locator("#list")).to_contain_text("Pago por Brayan")
    page.screenshot(path=f"{SHOTS}/05-historico.png", full_page=True)

    # 7) Marcar como vendido com troca e conferir o acerto
    page.click("[data-go=carros]"); page.click("[data-act=edit-car]")
    page.select_option("#f_status", "Vendido")
    page.fill("#f_vvenda", "40000"); page.select_option("#f_quemrec", "A")
    page.click("#fsave")
    expect(page.locator(".card")).to_contain_text("Vendido")
    page.click("[data-go=resumo]")
    expect(page.locator("#view")).to_contain_text("Acerto entre sócios")
    page.screenshot(path=f"{SHOTS}/06-resumo-vendido.png", full_page=True)

    # 8) Sair; sessão encerrada
    page.click("[data-act=logout]")
    expect(page.locator("#login")).to_be_visible()
    page.reload()
    expect(page.locator("#login")).to_be_visible()

    # 9) Marcos desativado cai no login na próxima ação
    login(page, "brayan", "senha-do-brayan")
    page.click("[data-go=ajustes]"); expect(page.locator("#users")).to_contain_text("marcos")
    page.click("[data-act=edit-user][data-id='2']")
    page.select_option("#u_active", "0"); page.click("#sheet button[type=submit]")
    m.click("[data-go=carros]")
    expect(m.locator("#login")).to_be_visible(timeout=12000)
    b.close()

if errors:
    print("ERROS NO NAVEGADOR:"); [print(" -", e) for e in errors]; sys.exit(1)
print("e2e ok")
