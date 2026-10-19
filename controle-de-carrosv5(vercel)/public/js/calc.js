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
  function summary(derived, expenses, planned, settings, today, year) {
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
  return { isConsig: isConsig, compute: compute, summary: summary, plan: plan, addMonths: addMonths, splitOf: splitOf, entry: entry, num: num, diff: diff, addDays: addDays, P: P };
})();
if (typeof module !== 'undefined') module.exports = Calc;
