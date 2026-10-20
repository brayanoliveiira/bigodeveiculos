/* Regras de cálculo: as mesmas da planilha. Sem acesso ao DOM; roda no navegador e no Node (testes).
   Sócios são "A" e "B" (nomes em configurações). Dinheiro em reais. */
var Calc = (function () {
  var P = ['A', 'B']; // códigos dos sócios; os nomes vêm das configurações
  function num(v) { return (v === null || v === undefined || v === '' || isNaN(v)) ? null : Number(v); }
  function N0(v) { var n = num(v); return n === null ? 0 : n; }
  function utc(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function diff(a, b) { return Math.round((utc(a) - utc(b)) / 86400000); }
  function addDays(s, n) { var d = new Date(utc(s) + n * 86400000); return d.toISOString().slice(0, 10); }
  function entry(c) {
    var eT = N0(c.entT), oA = num(c.ovrA), oB = num(c.ovrB);
    if (oA === null && oB === null) return { A: eT / 2, B: eT / 2 };
    if (oA === null) return { A: eT - oB, B: oB };
    if (oB === null) return { A: oA, B: eT - oA };
    return { A: oA, B: oB };
  }
  function addMonths(s, n) {
    var p = String(s).split('-'), y = +p[0], m = +p[1] - 1 + n, d = +p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
  }
  /* Gera as parcelas de um recebimento.
     o = { total, base (data da venda), mode: 'vista' | 'prazo' | 'parcelado',
           entrada (valor recebido na hora, em pix, só em 'prazo'/'parcelado'), prazoDias (prazo), n (parcelado), primeiro (data da 1ª parcela) }
     Devolve [{ label, due, valor, status, paidAt }] somando exatamente `total`. */
  function plan(o) {
    var total = Math.round(N0(o.total) * 100), base = o.base, out = [], mode = o.mode;
    if (total <= 0 || !base) return out;
    var ent = mode === 'vista' ? 0 : Math.min(total, Math.round(N0(o.entrada) * 100));
    if (mode === 'vista') { return [{ label: 'À vista', due: base, valor: total / 100, status: 'Recebido', paidAt: base }]; }
    if (ent > 0) out.push({ label: 'Entrada', due: base, valor: ent / 100, status: 'Recebido', paidAt: base });
    var rest = total - ent;
    if (rest <= 0) return out;
    if (mode === 'prazo') {
      var dias = Math.max(0, Math.round(N0(o.prazoDias)));
      out.push({ label: dias + ' dias', due: addDays(base, dias), valor: rest / 100, status: 'Pendente', paidAt: null });
      return out;
    }
    var n = Math.max(1, Math.min(60, Math.round(N0(o.n) || 1))), each = Math.floor(rest / n), left = rest - each * n;
    var anchor = o.primeiro || base, shift = o.primeiro ? 0 : 1; // dia do mês da âncora é preservado (31/01 → 28/02 → 31/03)
    for (var i = 0; i < n; i++) {
      out.push({ label: (i + 1) + '/' + n, due: addMonths(anchor, i + shift), valor: (each + (i === n - 1 ? left : 0)) / 100, status: 'Pendente', paidAt: null });
    }
    return out;
  }
  function splitOf(v, quem, quemrec) {
    var k = quem || quemrec;
    return k === 'A' ? [v, 0] : (k === 'B' ? [0, v] : [v / 2, v / 2]);
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function isConsig(c) { return !!(c && c.dono && String(c.dono).trim()); }
  /* payments: pagamentos das parcelas (receiptId, date, valor, quem). repasses: dinheiro repassado ao dono de carro consignado. */
  function compute(cars, expenses, planned, settings, today, receipts, payments, repasses) {
    var out = {}, i, id;
    cars.filter(function (c) { return !c.deleted; }).forEach(function (c) {
      var cs = isConsig(c), e = cs ? { A: 0, B: 0 } : entry(c); // consignado: ninguém pagou pelo carro
      out[c.id] = { c: c, consig: cs, entregue: false, emEspecie: 0, repasse: cs ? N0(c.repasse) : 0, repPago: 0, repPagoA: 0, repPagoB: 0, repasses: [], entA: e.A, entB: e.B, gast: 0, gastA: 0, gastB: 0, prev: 0, troca: 0, kindA: 0, kindB: 0, trocaCars: [], rec: [] };
    });
    expenses.filter(function (x) { return !x.deleted; }).forEach(function (x) {
      var d = out[x.carId]; if (!d) return;
      var v = N0(x.valor); d.gast += v;
      if (x.quem === P[0]) d.gastA += v; else if (x.quem === P[1]) d.gastB += v;
    });
    planned.filter(function (x) { return !x.deleted; }).forEach(function (x) {
      var d = out[x.carId]; if (!d) return;
      if (x.status !== 'Realizado' && x.status !== 'Cancelado') d.prev += N0(x.valor);
    });
    var payBy = {};
    (payments || []).filter(function (x) { return !x.deleted; }).forEach(function (x) { (payBy[x.receiptId] = payBy[x.receiptId] || []).push(x); });
    (receipts || []).filter(function (x) { return !x.deleted; }).forEach(function (x) {
      var d = out[x.carId]; if (d) d.rec.push(x);
    });
    (repasses || []).filter(function (x) { return !x.deleted; }).forEach(function (x) {
      var d = out[x.carId]; if (!d || !d.consig) return;
      var v = N0(x.valor), sp = splitOf(v, x.quem, d.c.quemrec);
      d.repPago += v; d.repPagoA += sp[0]; d.repPagoB += sp[1]; d.repasses.push(x);
    });
    for (id in out) {
      var o = out[id].c.origemId;
      if (o && out[o] && String(o) !== id) {
        out[o].troca += N0(out[id].c.entT); out[o].kindA += out[id].entA; out[o].kindB += out[id].entB;
        out[o].trocaCars.push(out[id].c.name);
        // Carro consignado vendido com carro na troca, e o carro da troca fica com o dono: ele não é nosso (ninguém investiu nele)
        // e o valor dele conta como repasse pago em carro. Vale quando o carro de troca tem o mesmo dono e nenhum repasse próprio.
        var oc = out[o], tc = out[id];
        if (oc.consig && tc.consig && !N0(tc.c.repasse) && String(oc.c.dono).trim().toLowerCase() === String(tc.c.dono).trim().toLowerCase()) {
          tc.entregue = true; oc.emEspecie += N0(tc.c.entT);
        }
      }
    }
    for (id in out) {
      var d = out[id], c = d.c;
      d.custo = d.entA + d.entB + d.repasse + d.gast; // consignado: o repasse ao dono é custo (sai da venda), mas ninguém o investiu
      d.repFalta = d.consig ? r2(Math.max(0, d.repasse - d.repPago - d.emEspecie)) : 0;
      var rr = splitOf(d.repFalta, null, c.quemrec);
      d.repA = d.repPagoA + rr[0]; d.repB = d.repPagoB + rr[1]; // quanto cada sócio terá pago ao dono quando tudo for repassado
      d.pmin = d.custo + d.prev;
      d.pmeta = d.pmin * (1 + N0(settings.meta));
      d.invA = d.entA + d.gastA; d.invB = d.entB + d.gastB;
      d.vendido = c.status === 'Vendido';
      var vv = num(c.vvenda), an = num(c.anun);
      d.cash = (d.vendido && vv !== null) ? vv - d.troca : null;
      if (d.cash !== null) {
        d.recA = c.quemrec === P[0] ? d.cash : (c.quemrec === P[1] ? 0 : d.cash / 2);
        d.recB = d.cash - d.recA;
      } else { d.recA = null; d.recB = null; }
      // Recebimentos: sem nenhum cadastrado, a venda conta como recebida por inteiro (à vista).
      d.rec.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
      d.recebido = null; d.aReceber = null; d.atrasado = 0; d.prox = null; d.semProg = 0; d.excesso = 0; d.nParc = d.rec.length; d.parcAtras = 0; d.parcelas = [];
      if (d.cash !== null && d.cash > 0 && d.rec.length) {
        var pl = 0, fA = 0, fB = 0, gA = 0, gB = 0, rc = 0, pend = 0;
        d.rec.forEach(function (r) {
          var v = N0(r.valor), pays = (payBy[r.id] || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
          var entradas = [], pago = 0, pA = 0, pB = 0;
          if (pays.length) {
            pays.forEach(function (p) {
              var pv = N0(p.valor), ps = splitOf(pv, p.quem || r.quem, c.quemrec);
              pago += pv; pA += ps[0]; pB += ps[1]; entradas.push({ date: p.date, valor: pv, A: ps[0], B: ps[1], p: p });
            });
          } else if (r.status === 'Recebido') { // jeito antigo: marcada como recebida, sem pagamentos lançados
            var ls = splitOf(v, r.quem, c.quemrec);
            pago = v; pA = ls[0]; pB = ls[1]; entradas.push({ date: r.paidAt || r.due, valor: v, A: ls[0], B: ls[1], p: null });
          }
          pago = r2(pago);
          var falta = r2(Math.max(0, v - pago)), atras = falta > 0.004 && r.due < today;
          var st = falta <= 0.004 ? 'Recebido' : (pago > 0.004 ? 'Parcial' : 'Pendente');
          var fs = splitOf(falta, r.quem, c.quemrec);
          pl += v; fA += pA + fs[0]; fB += pB + fs[1]; gA += pA; gB += pB; rc += Math.min(pago, v); pend += falta;
          if (falta > 0.004) {
            if (atras) { d.atrasado += falta; d.parcAtras++; }
            if (d.prox === null || r.due < d.prox) d.prox = r.due;
          }
          d.parcelas.push({ r: r, pagamentos: pays, entradas: entradas, pago: pago, falta: falta, st: st, atrasada: atras, ultimo: entradas.length ? entradas[entradas.length - 1].date : null });
        });
        var rest = d.cash - pl; if (Math.abs(rest) < 0.005) rest = 0;
        var rs = splitOf(Math.max(0, rest), null, c.quemrec);
        d.semProg = Math.max(0, rest); d.excesso = Math.max(0, -rest);
        d.recA = fA + rs[0]; d.recB = fB + rs[1];
        d.recebido = rc; d.recebidoA = gA; d.recebidoB = gB;
        d.aReceber = pend + d.semProg; d.aReceberA = d.recA - gA; d.aReceberB = d.recB - gB;
      } else if (d.cash !== null) {
        d.recebido = d.cash; d.recebidoA = d.recA; d.recebidoB = d.recB; d.aReceber = 0; d.aReceberA = 0; d.aReceberB = 0;
      }
      // Forma de pagamento da venda (para os relatórios).
      d.forma = null; d.prazoDias = null;
      if (d.cash !== null) {
        var tags = [];
        if (d.troca > 0) tags.push('Troca');
        if (d.cash > 0) {
          if (!d.rec.length) tags.push('À vista');
          else if (d.rec.length === 1) {
            var dd = c.dvenda ? diff(d.rec[0].due, c.dvenda) : 0; d.prazoDias = dd;
            tags.push(dd <= 0 ? 'À vista' : 'A prazo');
          } else tags.push('Parcelado');
        }
        d.forma = tags.join(' + ') || 'Troca';
      }
      if (c.divis === 'Proporcional ao investido') d.pA = (d.invA + d.invB) > 0 ? d.invA / (d.invA + d.invB) : 0.5;
      else if (c.divis === 'Personalizado') d.pA = num(c.pcust) === null ? 0.5 : num(c.pcust);
      else d.pA = 0.5;
      d.lucro = (d.vendido && vv !== null) ? vv - d.custo : null;
      d.lucA = d.lucro !== null ? d.lucro * d.pA : null;
      d.lucB = d.lucro !== null ? d.lucro - d.lucA : null;
      d.margem = (d.lucro !== null && d.custo > 0) ? d.lucro / d.custo : null;
      d.perdeu = (d.vendido && an !== null && vv !== null) ? Math.max(0, an - vv) : null;
      d.proj = (!d.vendido && an !== null) ? an - d.pmin : null;
      d.dias = c.dcompra ? (d.vendido ? (c.dvenda ? diff(c.dvenda, c.dcompra) : null) : diff(today, c.dcompra)) : null;
      d.diasLoc = (!d.vendido && c.locdesde) ? diff(today, c.locdesde) : null;
      d.atrasoLoc = !d.vendido && !!c.locprev && c.locprev < today;
      d.saiLogo = !d.vendido && !!c.locprev && c.locprev >= today && diff(c.locprev, today) <= 2;
    }
    return out;
  }
  /* juros (opcional) = jurosPagos(...) de todo o período: sai do lucro, metade de cada sócio; quem pagou do bolso recebe de volta no acerto. */
  function summary(derived, expenses, planned, settings, today, year, juros) {
    var list = Object.keys(derived).map(function (k) { return derived[k]; });
    var s = { total: list.length, estoque: 0, reservados: 0, vendidos: 0, parado: 0, prevPend: 0, fatur: 0, lucro: 0, custoVend: 0,
      perdeu: 0, proj: 0, diasSum: 0, diasN: 0, prejuizo: 0, trocaTot: 0, parados: 0, saidaVencida: 0, prevAtrasados: 0,
      recebido: 0, aReceber: 0, atrasado: 0, parcAtras: 0, repFalta: 0, comissao: 0, consigEstoque: 0 };
    var acc = [{ nome: P[0], inv: 0, rec: 0, luc: 0, recHoje: 0, aReceber: 0, rep: 0, repHoje: 0 }, { nome: P[1], inv: 0, rec: 0, luc: 0, recHoje: 0, aReceber: 0, rep: 0, repHoje: 0 }];
    var months = []; for (var m = 0; m < 12; m++) months.push({ n: 0, fat: 0, luc: 0 });
    list.forEach(function (d) {
      if (d.vendido) {
        s.vendidos++;
        if (d.lucro !== null) {
          s.fatur += N0(d.c.vvenda); s.lucro += d.lucro; s.custoVend += d.custo; s.trocaTot += d.troca;
          if (d.lucro < 0) s.prejuizo++;
          acc[0].inv += d.invA; acc[1].inv += d.invB;
          acc[0].rec += d.recA + d.kindA; acc[1].rec += d.recB + d.kindB;
          acc[0].luc += d.lucA; acc[1].luc += d.lucB;
          acc[0].recHoje += d.recebidoA + d.kindA; acc[1].recHoje += d.recebidoB + d.kindB;
          acc[0].aReceber += d.aReceberA; acc[1].aReceber += d.aReceberB;
          acc[0].rep += d.repA; acc[1].rep += d.repB; acc[0].repHoje += d.repPagoA; acc[1].repHoje += d.repPagoB;
          s.repFalta += d.repFalta; if (d.consig) s.comissao += d.lucro;
          s.recebido += d.recebido; s.aReceber += d.aReceber; s.atrasado += d.atrasado; s.parcAtras += d.parcAtras;
          if (d.c.dvenda && String(d.c.dvenda).slice(0, 4) === String(year)) {
            var mm = +String(d.c.dvenda).slice(5, 7) - 1;
            months[mm].n++; months[mm].fat += N0(d.c.vvenda); months[mm].luc += d.lucro;
          }
        }
        if (d.perdeu !== null) s.perdeu += d.perdeu;
        if (d.dias !== null) { s.diasSum += d.dias; s.diasN++; }
      } else if (d.entregue) {
        return; // carro de troca que fica com o dono do carro consignado: não é estoque nosso
      } else {
        if (d.c.status === 'Reservado') s.reservados++; else s.estoque++;
        s.parado += d.invA + d.invB; s.prevPend += d.prev; if (d.consig) s.consigEstoque++;
        if (d.proj !== null) s.proj += d.proj;
        if (d.dias !== null && d.dias > N0(settings.alerta)) s.parados++;
        if (d.atrasoLoc) s.saidaVencida++;
      }
    });
    var J = juros ? juros.total : 0;
    s.juros = J; s.lucroLiq = s.lucro - J;
    if (J) {
      acc[0].luc -= J / 2; acc[1].luc -= J / 2; acc[0].inv += juros.pagoA; acc[1].inv += juros.pagoB;
      Object.keys(juros.porMes).forEach(function (k) { if (k.slice(0, 4) === String(year)) months[+k.slice(5, 7) - 1].luc -= juros.porMes[k]; });
    }
    s.margem = s.custoVend > 0 ? s.lucro / s.custoVend : null;
    s.lucroMedio = s.vendidos ? s.lucro / s.vendidos : null;
    s.diasMedio = s.diasN ? s.diasSum / s.diasN : null;
    acc.forEach(function (a) { a.saldo = a.inv + a.luc - (a.rec - a.rep); a.saldoHoje = a.inv + a.luc - (a.recHoje - a.repHoje); });
    s.acerto = acc; s.months = months;
    planned.filter(function (x) { return !x.deleted && derived[x.carId] && x.status !== 'Realizado' && x.status !== 'Cancelado' && x.prazo && x.prazo < today; })
      .forEach(function () { s.prevAtrasados++; });
    var cat = {}, pes = {}; pes[P[0]] = 0; pes[P[1]] = 0; var gTot = 0;
    expenses.filter(function (x) { return !x.deleted && derived[x.carId]; }).forEach(function (x) {
      var v = N0(x.valor); gTot += v; var k = x.cat || 'Sem categoria'; cat[k] = (cat[k] || 0) + v;
      if (pes[x.quem] !== undefined) pes[x.quem] += v;
    });
    s.cat = cat; s.pessoas = pes; s.gastoTotal = gTot;
    return s;
  }
  /* ---------- Dívidas: empréstimos e contas a pagar ---------- */
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function mesAno(s) { var p = String(s).split('-'); return MESES[+p[1] - 1] + '/' + p[0].slice(2); }
  /* Parcelas de um empréstimo. l = { valor, data, modo, jurosMes, taxaMes, nParc, venc }.
     'Juros mensais': juros todo mês (no dia do empréstimo) até a devolução; no vencimento, juros do mês + o valor emprestado.
     'Parcelado': tabela Price com juros de taxaMes ao mês (sem juros: parcelas iguais); 1º vencimento em venc ou um mês depois.
     Devolve [{ label, tipo, due, valor }]. */
  /* Juros do mês a partir da % (0 a 1): em reais inteiros, arredondado para cima (3,3% de 33.333 = R$ 1.100). */
  function jurosDaTaxa(valor, taxa) { var c = Math.round(N0(valor) * N0(taxa) * 100); return Math.ceil(c / 100 - 0.001); }
  function loanPlan(l) {
    var v = N0(l.valor), out = [], i;
    if (v <= 0 || !l.data) return out;
    if (l.modo === 'Juros mensais') {
      if (!l.venc || l.venc <= l.data) return out;
      var j = num(l.jurosMes) !== null ? N0(l.jurosMes) : jurosDaTaxa(v, l.taxaMes);
      for (i = 1; i <= 120; i++) {
        var due = addMonths(l.data, i);
        if (due > l.venc) break;
        if (j > 0) out.push({ label: 'Juros ' + mesAno(due), tipo: 'Juros', due: due, valor: j });
      }
      var last = out.length ? out[out.length - 1].due : null;
      if (j > 0 && (!last || mesAno(last) !== mesAno(l.venc))) out.push({ label: 'Juros ' + mesAno(l.venc), tipo: 'Juros', due: l.venc, valor: j });
      out.push({ label: 'Devolução', tipo: 'Devolução', due: l.venc, valor: v });
      return out;
    }
    var n = Math.max(1, Math.min(120, Math.round(N0(l.nParc) || 1))), t = N0(l.taxaMes);
    var pmt = t > 0 ? v * t / (1 - Math.pow(1 + t, -n)) : v / n;
    var cents = Math.round(pmt * 100), total = cents * n;
    if (t <= 0) total = Math.round(v * 100); // sem juros: soma exata do valor
    var each = t > 0 ? cents : Math.floor(total / n), left = total - each * n;
    var anchor = l.venc || l.data, shift = l.venc ? 0 : 1;
    for (i = 0; i < n; i++) out.push({ label: (i + 1) + '/' + n, tipo: 'Parcela', due: addMonths(anchor, i + shift), valor: (each + (i === n - 1 ? left : 0)) / 100 });
    return out;
  }
  /* Rastreio do dinheiro de um empréstimo pelos carros: começa no carro comprado com ele e segue as trocas
     (carro vendido -> carros que entraram na troca dele, origemId). Enquanto um carro da cadeia não foi vendido, o dinheiro "está" nele.
     Quando o último é vendido sem carro de troca, o dinheiro virou dinheiro. skip(c) = true ignora o carro (ex.: troca que ficou com o dono do consignado).
     Devolve null (carro inexistente) ou { path: [carros na ordem], holders: [carros em estoque/reservados], emDinheiro, ultimaVenda }. */
  function loanTrail(carId, cars, skip) {
    var by = {}, kids = {}, seen = {}, r = { path: [], holders: [], emDinheiro: false, ultimaVenda: null };
    (cars || []).forEach(function (c) { if (!c.deleted) by[c.id] = c; });
    Object.keys(by).forEach(function (id) {
      var c = by[id], o = c.origemId;
      if (o != null && by[o] && String(o) !== String(id) && !(skip && skip(c))) (kids[o] = kids[o] || []).push(c);
    });
    if (carId == null || !by[carId]) return null;
    (function walk(c) {
      if (seen[c.id]) return;
      seen[c.id] = true; r.path.push(c);
      if (c.status !== 'Vendido') { r.holders.push(c); return; }
      if (c.dvenda && (!r.ultimaVenda || c.dvenda > r.ultimaVenda)) r.ultimaVenda = c.dvenda;
      (kids[c.id] || []).sort(function (a, b) { return a.id - b.id; }).forEach(walk);
    })(by[carId]);
    r.emDinheiro = !r.holders.length;
    return r;
  }
  /* Juros de empréstimos já pagos: custo da sociedade, descontado do lucro (não é custo de nenhum carro).
     Juros mensais: as contas do tipo 'Juros'. Parcelado: a parte de juros de cada parcela paga (proporcional: juros total / total das parcelas).
     Data = paidAt (ou vencimento). from/to = 'AAAA-MM-DD' (vazio = sem limite).
     Devolve { total, pagoA, pagoB (quanto cada sócio tirou do bolso), porMes: { 'AAAA-MM': valor } }. */
  function jurosPagos(payables, loans, from, to) {
    var lv = {}, tot = {}, s = { total: 0, pagoA: 0, pagoB: 0, porMes: {} };
    (loans || []).forEach(function (l) { if (!l.deleted) lv[l.id] = l; });
    var live = (payables || []).filter(function (x) { return !x.deleted && x.loanId != null && lv[x.loanId]; });
    live.forEach(function (x) { tot[x.loanId] = (tot[x.loanId] || 0) + N0(x.valor); });
    live.forEach(function (x) {
      if (x.status !== 'Pago') return;
      var l = lv[x.loanId], v = N0(x.valor), t = tot[x.loanId];
      var j = l.modo === 'Parcelado' ? (t > 0 ? v * Math.max(0, t - N0(l.valor)) / t : 0) : (x.tipo === 'Juros' ? v : 0);
      var d = x.paidAt || x.due;
      if (j <= 0 || (from && d < from) || (to && d > to)) return;
      var sp = splitOf(j, x.quem), k = String(d).slice(0, 7);
      s.total += j; s.pagoA += sp[0]; s.pagoB += sp[1]; s.porMes[k] = (s.porMes[k] || 0) + j;
    });
    s.total = r2(s.total); s.pagoA = r2(s.pagoA); s.pagoB = r2(s.pagoB);
    Object.keys(s.porMes).forEach(function (k) { s.porMes[k] = r2(s.porMes[k]); });
    return s;
  }
  /* Resumo das contas a pagar. Conta paga por "ambos" (quem vazio) divide meio a meio.
     Ignora contas excluídas e as de empréstimo ou carro excluído. */
  function debts(payables, loans, cars, today) {
    var lv = {}, cv = {}, s = { total: 0, A: 0, B: 0, atrasado: 0, prox30: 0, pago: 0, jurosPagos: 0, jurosPend: 0, jurosMes: 0, quitAtrasadas: 0, prox: null, n: 0, porLoan: {}, porCar: {} };
    (loans || []).forEach(function (l) { if (!l.deleted) lv[l.id] = l; });
    (cars || []).forEach(function (c) { if (!c.deleted) cv[c.id] = c; });
    var em30 = addDays(today, 30);
    (payables || []).forEach(function (x) {
      if (x.deleted) return;
      if (x.loanId != null ? !lv[x.loanId] : !cv[x.carId]) return;
      var v = N0(x.valor), key = x.loanId != null ? 'porLoan' : 'porCar', id = x.loanId != null ? x.loanId : x.carId;
      var g = s[key][id] || (s[key][id] = { total: 0, pago: 0, falta: 0, A: 0, B: 0, atrasado: 0, prox: null, proxValor: 0, n: 0, nPago: 0, jurosPagos: 0, jurosDepois: 0, fim: null, itens: [] });
      g.total += v; g.n++; g.itens.push(x);
      if (!g.fim || x.due > g.fim) g.fim = x.due;
      // juros mensais ainda não pagos que vencem depois da quitação prevista: não serão pagos se quitarmos antes
      if (x.loanId != null && x.status !== 'Pago' && x.tipo === 'Juros' && lv[x.loanId].quitPrev && x.due > lv[x.loanId].quitPrev) g.jurosDepois += v;
      if (x.status === 'Pago') {
        s.pago += v; g.pago += v; g.nPago++;
        if (x.tipo === 'Juros') { s.jurosPagos += v; g.jurosPagos += v; }
        return;
      }
      var sp = splitOf(v, x.quem);
      s.total += v; s.A += sp[0]; s.B += sp[1]; s.n++;
      g.falta += v; g.A += sp[0]; g.B += sp[1];
      if (x.due < today) { s.atrasado += v; g.atrasado += v; }
      else if (x.due <= em30) s.prox30 += v;
      if (s.prox === null || x.due < s.prox) s.prox = x.due;
      if (g.prox === null || x.due < g.prox) { g.prox = x.due; g.proxValor = v; } else if (x.due === g.prox) g.proxValor += v;
    });
    Object.keys(s.porLoan).forEach(function (id) {
      var l = lv[id], g = s.porLoan[id];
      g.itens.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
      g.juros = r2(g.total - N0(l.valor)); // juros do empréstimo inteiro (pago + a pagar)
      g.quitado = g.falta <= 0.004;
      if (l.modo === 'Parcelado' && g.total > 0) g.jurosPagos = r2(g.pago * g.juros / g.total); // parcela = parte juros + parte valor
      if (l.modo === 'Juros mensais' && g.falta > 0.004) s.jurosMes += num(l.jurosMes) !== null ? N0(l.jurosMes) : jurosDaTaxa(N0(l.valor), l.taxaMes);
      if (l.modo === 'Parcelado') s.jurosPagos += g.jurosPagos;
      s.jurosPend += Math.max(0, r2(g.juros - g.jurosPagos - g.jurosDepois)); // juros que ainda vamos pagar (até a quitação prevista)
      g.quitPrev = l.quitPrev || g.fim; g.quitPrevManual = !!l.quitPrev; // vazio = data da última parcela
      g.quitAtrasada = !g.quitado && !!g.quitPrev && g.quitPrev < today;
      if (g.quitAtrasada) s.quitAtrasadas++;
    });
    Object.keys(s.porCar).forEach(function (id) { s.porCar[id].itens.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); }); });
    return s;
  }
  return { jurosDaTaxa: jurosDaTaxa, loanPlan: loanPlan, debts: debts, jurosPagos: jurosPagos, loanTrail: loanTrail, isConsig: isConsig, compute: compute, summary: summary, plan: plan, addMonths: addMonths, splitOf: splitOf, entry: entry, num: num, diff: diff, addDays: addDays, P: P };
})();
if (typeof module !== 'undefined') module.exports = Calc;
