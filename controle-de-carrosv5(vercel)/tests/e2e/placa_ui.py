"""
Máscara de moeda e consulta de placa/FIPE na tela.
Pré-requisitos: node tests/e2e/mock-placa.js 3999  e o servidor com PLACA_API_TOKEN=x PLACA_API_URL=http://127.0.0.1:3999/consulta,
banco novo e ADMIN_USER=brayan / ADMIN_PASSWORD=senha-do-brayan.   Uso: BASE=http://localhost:3456 python3 tests/e2e/placa_ui.py
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
    page.screenshot(path=f"{SHOTS}/10-login.png")
    page.fill("#lu", "brayan"); page.fill("#lp", "senha-do-brayan"); page.click("#lgo")
    expect(page.locator(".brand h1")).to_have_text("Bigodes Car")
    expect(page.locator(".brand")).not_to_contain_text("Marcos")

    page.click("[data-go=carros]")
    page.click("[data-act=new-car]")
    # placa em maiúsculo
    page.type("#f_placa", "civ1c23")
    expect(page.locator("#f_placa")).to_have_value("CIV1C23")
    # consulta
    page.click("#plbtn")
    expect(page.locator("#plres")).to_contain_text("Honda Civic")
    expect(page.locator("#f_name")).to_have_value(re.compile(r"Honda Civic"))
    expect(page.locator("#f_ano")).to_have_value("2012")
    expect(page.locator("#f_cor")).to_have_value("Preta")
    assert re.sub(r"\s", " ", page.input_value("#f_fipe")) == "R$ 52.400,00", page.input_value("#f_fipe")
    expect(page.locator("#f_fipeRef")).to_have_value(re.compile(r"014074-7"))
    # trocar a versão da FIPE
    page.select_option("#plfipe", "1")
    assert "49.900,00" in page.input_value("#f_fipe")
    page.select_option("#plfipe", "0")
    # máscara de moeda ao digitar
    page.click("#f_entT"); page.keyboard.type("2000")
    assert re.sub(r"\s", " ", page.input_value("#f_entT")) == "R$ 2.000", page.input_value("#f_entT")
    page.keyboard.type(",5")
    assert re.sub(r"\s", " ", page.input_value("#f_entT")) == "R$ 2.000,5"
    page.click("#f_anun")   # sai do campo: completa os centavos
    assert re.sub(r"\s", " ", page.input_value("#f_entT")) == "R$ 2.000,50", page.input_value("#f_entT")
    page.keyboard.type("45000")
    page.fill("#f_entT", "")
    page.keyboard.type("48000")
    page.click("#f_cor")
    assert re.sub(r"\s", " ", page.input_value("#f_entT")) == "R$ 48.000,00"
    expect(page.locator("#entnote")).to_contain_text("24.000,00")
    page.screenshot(path=f"{SHOTS}/11-form-carro.png", full_page=True)
    page.click("#fsave")
    expect(page.locator(".card")).to_have_count(1)
    expect(page.locator(".card")).to_contain_text("FIPE")
    expect(page.locator(".card")).to_contain_text("compra a 92% da FIPE")
    page.screenshot(path=f"{SHOTS}/12-carros.png", full_page=True)

    # editar: o valor volta formatado e salva igual
    page.click("[data-act=edit-car]")
    assert re.sub(r"\s", " ", page.input_value("#f_entT")) == "R$ 48.000,00"
    page.click("[data-x=cancel]")

    # busca gratuita na tabela FIPE (marca > modelo > ano)
    page.click("[data-act=new-car]")
    page.click("#fpbtn")
    expect(page.locator("#fp_marca option")).to_have_count(3)
    page.select_option("#fp_marca", "23")
    expect(page.locator("#fp_modelo option")).to_have_count(3)
    page.fill("#fp_busca", "onix 1.0")
    expect(page.locator("#fp_modelo option")).to_have_count(2)
    page.fill("#fp_busca", "onix hatch")
    expect(page.locator("#fp_modelo option")).to_have_count(1)
    page.select_option("#fp_modelo", "5940")
    expect(page.locator("#fp_ano option")).to_have_count(3)
    page.select_option("#fp_ano", "2019-1")
    expect(page.locator("#fp_res")).to_contain_text("58.700,00")
    assert re.sub(r"\s", " ", page.input_value("#f_fipe")) == "R$ 58.700,00"
    expect(page.locator("#f_name")).to_have_value(re.compile(r"^Chevrolet Onix Hatch"))
    expect(page.locator("#f_ano")).to_have_value("2019")
    expect(page.locator("#f_fipeRef")).to_have_value(re.compile(r"004431-7"))
    page.screenshot(path=f"{SHOTS}/13-fipe-gratis.png", full_page=True)
    page.click("[data-x=cancel]")

    # placa inexistente
    page.click("[data-act=new-car]")
    page.type("#f_placa", "AAA0000"); page.click("#plbtn")
    expect(page.locator("#plres")).to_contain_text("não encontrada")
    page.click("[data-x=cancel]")
    b.close()

if errors:
    print("ERROS NO NAVEGADOR:"); [print(" ", e) for e in errors]; raise SystemExit(1)
print("OK placa_ui")
