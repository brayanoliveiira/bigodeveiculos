/* Relatórios gerenciais. Funções puras (sem DOM): recebem os dados já calculados por Calc.compute (D)
   e devolvem tabelas prontas para a tela, para CSV e para os testes.
   Sócios são 'A' e 'B'. Período: from/to = 'AAAA-MM-DD' (inclusive); vazio = sem limite.
   O período vale para vendas (data da venda), gastos (data do gasto) e recebimentos (data do vencimento/recebimento).
   Estoque e recebíveis em aberto ignoram o período: são a foto de hoje. */
var Reports = (function () {
  var C = (typeof Calc !== 'undefined') ? Calc : require('./calc.js');
  var N0 = function (v) { var n = C.num(v); return n === null ? 0 : n; };
  var list = function (D) { return Object.keys(D).map(function (k) { return D[k]; }); };
  var inRange = function (d, from, to) {
    if (!from && !to) return true;
    if (!d) return false;
    return (!from || d >= from) && (!to || d <= to);
  };
  var mkey = function (d) { return d ? String(d).slice(0, 7) : ''; };
  function monthsBetween(keys) {
    var ks = keys.filter(Boolean).sort();
    if (!ks.length) return [];
    var out = [], y = +ks[0].slice(0, 4), m = +ks[0].slice(5, 7), ey = +ks[ks.length - 1].slice(0, 4), em = +ks[ks.length - 1].slice(5, 7);
    while (y < ey || (y === ey && m <= em)) { out.push(y + '-' + (m < 10 ? '0' : '') + m); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  var sumBy = function (arr, f) { return arr.reduce(function (a, x) { return a + f(x); }, 0); };
  var soldIn = function (D, from, to) {
    return list(D).filter(function (d) { return d.vendido && d.lucro !== null && inRange(d.c.dvenda, from, to); });
  };

  /* 1. Por sócio: quanto cada um tem investido (em estoque e já vendido), recebeu, lucro e saldo. */
  function porSocio(D, expenses, from, to) {
    var res = {};
    ['A', 'B'].forEach(function (p) {
      var e = { n: 0, entrada: 0, gastos: 0, inv: 0 }, v = { n: 0, inv: 0, luc: 0, rec: 0, recHoje: 0, aReceber: 0, rep: 0, repHoje: 0 };
      list(D).forEach(function (d) {
        var ent = p === 'A' ? d.entA : d.entB, gas = p === 'A' ? d.gastA : d.gastB;
        if (!d.vendido) { e.n++; e.entrada += ent; e.gastos += gas; e.inv += ent + gas; }
      });
      soldIn(D, from, to).forEach(function (d) {
        var A = p === 'A';
        v.n++; v.inv += A ? d.invA : d.invB; v.luc += A ? d.lucA : d.lucB;
        v.rec += (A ? d.recA + d.kindA : d.recB + d.kindB);
        v.recHoje += (A ? d.recebidoA + d.kindA : d.recebidoB + d.kindB);
        v.aReceber += A ? d.aReceberA : d.aReceberB;
        v.rep += A ? d.repA : d.repB; v.repHoje += A ? d.repPagoA : d.repPagoB; // repasses a donos de carros consignados
      });
      var gastoPeriodo = sumBy((expenses || []).filter(function (x) { return !x.deleted && D[x.carId] && x.quem === p && inRange(x.date, from, to); }), function (x) { return N0(x.valor); });
      res[p] = {
        estoque: e, vendidos: v, totalInvestido: e.inv + v.inv, gastoPeriodo: gastoPeriodo,
        roi: v.inv > 0 ? v.luc / v.inv : null,
        saldo: v.inv + v.luc - (v.rec - v.rep), saldoHoje: v.inv + v.luc - (v.recHoje - v.repHoje),
      };
    });
    return res;
  }

  /* 2. Lucro por mês, separado por investidor. */
  function lucroMensal(D, from, to) {
    var rows = {}, sold = soldIn(D, from, to);
    sold.forEach(function (d) {
      var k = mkey(d.c.dvenda), r = rows[k] || (rows[k] = { mes: k, n: 0, fat: 0, custo: 0, lucro: 0, lucA: 0, lucB: 0, perdeu: 0 });
      r.n++; r.fat += N0(d.c.vvenda); r.custo += d.custo; r.lucro += d.lucro; r.lucA += d.lucA; r.lucB += d.lucB; r.perdeu += d.perdeu || 0;
    });
    var months = monthsBetween(Object.keys(rows)), out = months.map(function (m) { return rows[m] || { mes: m, n: 0, fat: 0, custo: 0, lucro: 0, lucA: 0, lucB: 0, perdeu: 0 }; });
    if (rows['']) out.push(rows['']);
    out.forEach(function (r) { r.margem = r.custo > 0 ? r.lucro / r.custo : null; });
    var tot = { mes: 'Total', n: 0, fat: 0, custo: 0, lucro: 0, lucA: 0, lucB: 0, perdeu: 0 };
    out.forEach(function (r) { ['n', 'fat', 'custo', 'lucro', 'lucA', 'lucB', 'perdeu'].forEach(function (k) { tot[k] += r[k]; }); });
    tot.margem = tot.custo > 0 ? tot.lucro / tot.custo : null;
    return { rows: out, total: tot };
  }

  /* 3. Caixa por mês: dinheiro que entrou (recebido) e que deve entrar (previsto), por sócio. */
  function caixaMensal(D, today, from, to) {
    var rows = {}, semData = 0;
    var row = function (k) { return rows[k] || (rows[k] = { mes: k, recebido: 0, recA: 0, recB: 0, previsto: 0, prevA: 0, prevB: 0, atrasado: 0 }); };
    list(D).forEach(function (d) {
      if (!d.vendido || d.cash === null || d.cash <= 0) return;
      if (!d.rec.length) {
        if (!inRange(d.c.dvenda, from, to) || !d.c.dvenda) return;
        var r0 = row(mkey(d.c.dvenda)); r0.recebido += d.cash; r0.recA += d.recA; r0.recB += d.recB; return;
      }
      d.parcelas.forEach(function (pc) {
        pc.entradas.forEach(function (en) { // cada pagamento entra no mês em que foi feito
          var dt = en.date; if (!inRange(dt, from, to)) return;
          var r = row(mkey(dt)); r.recebido += en.valor; r.recA += en.A; r.recB += en.B;
        });
        if (pc.falta > 0.004 && inRange(pc.r.due, from, to)) { // o que falta da parcela fica no mês do vencimento
          var sp = C.splitOf(pc.falta, pc.r.quem, d.c.quemrec), q = row(mkey(pc.r.due));
          q.previsto += pc.falta; q.prevA += sp[0]; q.prevB += sp[1];
          if (pc.r.due < today) q.atrasado += pc.falta;
        }
      });
      semData += d.semProg;
    });
    var out = monthsBetween(Object.keys(rows)).map(function (m) { return rows[m] || row(m); });
    var tot = { mes: 'Total', recebido: 0, recA: 0, recB: 0, previsto: 0, prevA: 0, prevB: 0, atrasado: 0 };
    out.forEach(function (r) { Object.keys(tot).forEach(function (k) { if (k !== 'mes') tot[k] += r[k]; }); });
    return { rows: out, total: tot, semProgramar: semData };
  }

  /* 4. Recebíveis em aberto: parcelas pendentes, vencimentos por faixa e por sócio. */
  var FAIXAS = ['Atrasado', 'Vence em até 30 dias', 'De 31 a 60 dias', 'De 61 a 90 dias', 'Mais de 90 dias'];
  function recebiveis(D, today) {
    var items = [], porCarro = [];
    list(D).forEach(function (d) {
      if (!d.vendido || d.cash === null) return;
      d.parcelas.forEach(function (pc) {
        if (pc.falta <= 0.004) return;
        var x = pc.r, v = pc.falta, sp = C.splitOf(v, x.quem, d.c.quemrec), dd = C.diff(x.due, today), f;
        f = dd < 0 ? 0 : dd <= 30 ? 1 : dd <= 60 ? 2 : dd <= 90 ? 3 : 4;
        items.push({ carId: d.c.id, car: d.c.name, comprador: d.c.comprador || '', label: (x.label || '') + (pc.pago > 0.004 ? ' (falta o resto)' : ''), due: x.due, valor: v, A: sp[0], B: sp[1], dias: dd, atraso: dd < 0 ? -dd : 0, faixa: f, faixaNome: FAIXAS[f], id: x.id, parcial: pc.pago > 0.004 });
      });
      if (d.aReceber > 0.004 || d.nParc) {
        porCarro.push({ carId: d.c.id, car: d.c.name, comprador: d.c.comprador || '', dvenda: d.c.dvenda, forma: d.forma, vvenda: N0(d.c.vvenda), troca: d.troca, cash: d.cash, recebido: d.recebido,
          aReceber: d.aReceber, atrasado: d.atrasado, prox: d.prox, nParc: d.nParc, semProg: d.semProg, excesso: d.excesso });
      }
    });
    items.sort(function (a, b) { return a.due.localeCompare(b.due); });
    porCarro = porCarro.filter(function (r) { return r.aReceber > 0.004 || r.excesso > 0.004; }).sort(function (a, b) { return (b.atrasado - a.atrasado) || (a.prox || '9').localeCompare(b.prox || '9'); });
    var faixas = FAIXAS.map(function (n, i) {
      var its = items.filter(function (x) { return x.faixa === i; });
      return { nome: n, n: its.length, valor: sumBy(its, function (x) { return x.valor; }), A: sumBy(its, function (x) { return x.A; }), B: sumBy(its, function (x) { return x.B; }) };
    });
    var semProg = sumBy(list(D), function (d) { return d.vendido ? d.semProg : 0; });
    return {
      items: items, porCarro: porCarro, faixas: faixas, semProgramar: semProg,
      total: sumBy(items, function (x) { return x.valor; }), A: sumBy(items, function (x) { return x.A; }), B: sumBy(items, function (x) { return x.B; }),
      atrasado: sumBy(items.filter(function (x) { return x.faixa === 0; }), function (x) { return x.valor; }),
    };
  }

  /* 5. Vendas por forma de pagamento. */
  function vendasPorForma(D, from, to) {
    var g = {}, sold = soldIn(D, from, to);
    sold.forEach(function (d) {
      var k = d.forma || 'Sem forma', r = g[k] || (g[k] = { forma: k, n: 0, fat: 0, lucro: 0, custo: 0, troca: 0, cash: 0, prazoPeso: 0, prazoBase: 0, parcelas: 0 });
      r.n++; r.fat += N0(d.c.vvenda); r.lucro += d.lucro; r.custo += d.custo; r.troca += d.troca; r.cash += Math.max(0, d.cash || 0); r.parcelas += d.nParc || 0;
      if (d.c.dvenda && d.rec.length) d.rec.forEach(function (x) { r.prazoPeso += N0(x.valor) * Math.max(0, C.diff(x.due, d.c.dvenda)); r.prazoBase += N0(x.valor); });
    });
    var rows = Object.keys(g).map(function (k) {
      var r = g[k];
      r.ticket = r.n ? r.fat / r.n : null; r.margem = r.custo > 0 ? r.lucro / r.custo : null;
      r.prazoMedio = r.prazoBase > 0 ? r.prazoPeso / r.prazoBase : 0; r.parcelasMedia = r.n ? r.parcelas / r.n : 0;
      return r;
    }).sort(function (a, b) { return b.fat - a.fat; });
    var totFat = sumBy(rows, function (r) { return r.fat; });
    rows.forEach(function (r) { r.share = totFat ? r.fat / totFat : 0; });
    var comTroca = sold.filter(function (d) { return d.troca > 0; });
    return {
      rows: rows, total: { n: sold.length, fat: totFat, lucro: sumBy(rows, function (r) { return r.lucro; }) },
      trocas: { n: comTroca.length, valor: sumBy(comTroca, function (d) { return d.troca; }), share: sold.length ? comTroca.length / sold.length : 0 },
    };
  }

  /* 6. Estoque: capital parado por sócio, idade dos carros, projeção. */
  var IDADES = ['Até 30 dias', '31 a 60 dias', '61 a 90 dias', 'Mais de 90 dias', 'Sem data de compra'];
  function estoque(D, settings) {
    var rows = list(D).filter(function (d) { return !d.vendido && !d.entregue; }).map(function (d) {
      var f = d.dias === null ? 4 : d.dias <= 30 ? 0 : d.dias <= 60 ? 1 : d.dias <= 90 ? 2 : 3;
      return { carId: d.c.id, car: d.c.name, placa: d.c.placa || '', status: d.c.status, loc: d.c.loc || '', dias: d.dias, faixa: f, invA: d.invA, invB: d.invB, custo: d.invA + d.invB, dono: d.consig ? d.c.dono : '', repasse: d.repasse,
        prev: d.prev, pmin: d.pmin, pmeta: d.pmeta, anun: N0(d.c.anun), proj: d.proj, parado: d.dias !== null && d.dias > N0(settings && settings.alerta) };
    }).sort(function (a, b) { return (b.dias === null ? -1 : b.dias) - (a.dias === null ? -1 : a.dias); });
    var faixas = IDADES.map(function (n, i) {
      var its = rows.filter(function (r) { return r.faixa === i; });
      return { nome: n, n: its.length, A: sumBy(its, function (r) { return r.invA; }), B: sumBy(its, function (r) { return r.invB; }), custo: sumBy(its, function (r) { return r.custo; }) };
    });
    return {
      rows: rows, faixas: faixas,
      total: { n: rows.length, A: sumBy(rows, function (r) { return r.invA; }), B: sumBy(rows, function (r) { return r.invB; }), custo: sumBy(rows, function (r) { return r.custo; }),
        proj: sumBy(rows, function (r) { return r.proj || 0; }), prev: sumBy(rows, function (r) { return r.prev; }) },
    };
  }

  /* 6b. Consignados: carros de terceiros. Repasse ao dono, o que já foi repassado e a comissão. */
  function consignados(D, today) {
    var rows = list(D).filter(function (d) { return d.consig && !d.entregue; }).map(function (d) {
      return { carId: d.c.id, car: d.c.name, placa: d.c.placa || '', dono: d.c.dono, status: d.c.status, dvenda: d.c.dvenda || '', vvenda: N0(d.c.vvenda),
        repasse: d.repasse, repassado: d.repPago + d.emEspecie, falta: d.repFalta, gastos: d.gast, comissao: d.lucro, comA: d.lucA, comB: d.lucB, vendido: d.vendido,
        minimo: d.pmin, anun: N0(d.c.anun), proj: d.proj, recebido: d.recebido, aReceber: d.aReceber };
    }).sort(function (a, b) { return (a.vendido ? 1 : 0) - (b.vendido ? 1 : 0) || String(b.dvenda).localeCompare(String(a.dvenda)); });
    var sold = rows.filter(function (r) { return r.vendido && r.comissao !== null; });
    return {
      rows: rows,
      total: { n: rows.length, vendidos: sold.length, repasse: sumBy(sold, function (r) { return r.repasse; }), repassado: sumBy(rows, function (r) { return r.repassado; }),
        falta: sumBy(sold, function (r) { return r.falta; }), comissao: sumBy(sold, function (r) { return r.comissao; }), comA: sumBy(sold, function (r) { return r.comA; }), comB: sumBy(sold, function (r) { return r.comB; }),
        gastos: sumBy(sold, function (r) { return r.gastos; }) },
    };
  }

  /* 7. Gastos: por categoria x sócio, por mês, por carro. */
  function gastos(D, expenses, from, to) {
    var ex = (expenses || []).filter(function (x) { return !x.deleted && D[x.carId] && inRange(x.date, from, to); });
    var cat = {}, mes = {}, car = {};
    ex.forEach(function (x) {
      var v = N0(x.valor), k = x.cat || 'Sem categoria', c = cat[k] || (cat[k] = { cat: k, n: 0, total: 0, A: 0, B: 0 });
      c.n++; c.total += v; if (x.quem === 'A') c.A += v; else if (x.quem === 'B') c.B += v;
      var m = mes[mkey(x.date)] || (mes[mkey(x.date)] = { mes: mkey(x.date), total: 0, A: 0, B: 0 });
      m.total += v; if (x.quem === 'A') m.A += v; else if (x.quem === 'B') m.B += v;
      var cr = car[x.carId] || (car[x.carId] = { carId: x.carId, car: D[x.carId].c.name, total: 0, n: 0 });
      cr.total += v; cr.n++;
    });
    var total = sumBy(ex, function (x) { return N0(x.valor); });
    var cats = Object.keys(cat).map(function (k) { cat[k].share = total ? cat[k].total / total : 0; return cat[k]; }).sort(function (a, b) { return b.total - a.total; });
    var meses = monthsBetween(Object.keys(mes)).map(function (m) { return mes[m] || { mes: m, total: 0, A: 0, B: 0 }; });
    var cars = Object.keys(car).map(function (k) { return car[k]; }).sort(function (a, b) { return b.total - a.total; });
    return {
      total: total, n: ex.length, A: sumBy(ex, function (x) { return x.quem === 'A' ? N0(x.valor) : 0; }), B: sumBy(ex, function (x) { return x.quem === 'B' ? N0(x.valor) : 0; }),
      porCarro: cars.length ? total / cars.length : 0, cats: cats, meses: meses, cars: cars,
    };
  }

  /* 8. Desempenho por carro vendido. */
  function ranking(D, from, to) {
    var rows = soldIn(D, from, to).map(function (d) {
      return { carId: d.c.id, car: d.c.name, placa: d.c.placa || '', dvenda: d.c.dvenda || '', comprador: d.c.comprador || '', forma: d.forma, dias: d.dias, custo: d.custo, vvenda: N0(d.c.vvenda),
        lucro: d.lucro, margem: d.margem, lucA: d.lucA, lucB: d.lucB, lucroDia: d.dias > 0 ? d.lucro / d.dias : null, perdeu: d.perdeu || 0, invA: d.invA, invB: d.invB };
    }).sort(function (a, b) { return b.lucro - a.lucro; });
    return { rows: rows, melhor: rows[0] || null, pior: rows.length ? rows[rows.length - 1] : null };
  }

  /* 9. Visão geral do período. */
  function visaoGeral(D, expenses, today, settings, from, to) {
    var sold = soldIn(D, from, to), fat = sumBy(sold, function (d) { return N0(d.c.vvenda); }), lucro = sumBy(sold, function (d) { return d.lucro; }), custo = sumBy(sold, function (d) { return d.custo; });
    var diasN = sold.filter(function (d) { return d.dias !== null; }), est = estoque(D, settings), rec = recebiveis(D, today);
    return {
      vendas: sold.length, fat: fat, lucro: lucro, custo: custo, margem: custo > 0 ? lucro / custo : null, ticket: sold.length ? fat / sold.length : null,
      lucroMedio: sold.length ? lucro / sold.length : null, diasMedio: diasN.length ? sumBy(diasN, function (d) { return d.dias; }) / diasN.length : null,
      perdeu: sumBy(sold, function (d) { return d.perdeu || 0; }), prejuizo: sold.filter(function (d) { return d.lucro < 0; }).length,
      capitalEstoque: est.total.custo, estoqueN: est.total.n, projEstoque: est.total.proj, aReceber: rec.total + rec.semProgramar, atrasado: rec.atrasado,
      gastos: gastos(D, expenses, from, to).total,
    };
  }

  /* Período pronto: devolve { from, to } a partir do nome. */
  function periodo(nome, today, custom) {
    var y = +String(today).slice(0, 4), m = +String(today).slice(5, 7);
    if (nome === 'ano') return { from: y + '-01-01', to: y + '-12-31' };
    if (nome === 'ano-passado') return { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31' };
    if (nome === 'mes') { var last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: y + '-' + (m < 10 ? '0' : '') + m + '-01', to: y + '-' + (m < 10 ? '0' : '') + m + '-' + last }; }
    if (nome === '12m') return { from: C.addMonths(today, -12), to: today };
    if (nome === 'custom') return { from: (custom && custom.from) || '', to: (custom && custom.to) || '' };
    return { from: '', to: '' };
  }

  /* CSV para abrir direto no Excel brasileiro: separador ';', decimais com vírgula. */
  function toCsv(cols, rows) {
    var cell = function (v, col) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
      var t = String(col && col.date && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v);
      return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    var head = cols.map(function (c) { return cell(c.label); }).join(';');
    return [head].concat(rows.map(function (r) { return cols.map(function (c) { return cell(typeof c.get === 'function' ? c.get(r) : r[c.k], c); }).join(';'); })).join('\r\n');
  }

  return { porSocio: porSocio, lucroMensal: lucroMensal, caixaMensal: caixaMensal, recebiveis: recebiveis, vendasPorForma: vendasPorForma, estoque: estoque, consignados: consignados,
    gastos: gastos, ranking: ranking, visaoGeral: visaoGeral, periodo: periodo, toCsv: toCsv, FAIXAS: FAIXAS, IDADES: IDADES };
})();
if (typeof module !== 'undefined') module.exports = Reports;
