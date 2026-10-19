// Servidor de mentira do provedor de placa, só para o teste de tela. Uso: node tests/e2e/mock-placa.js [porta]
const http = require('http');
http.createServer((req, res) => {
  const f = req.url.match(/^\/fipe(\/.*)$/);
  if (f) {
    res.setHeader('content-type', 'application/json');
    const R = {
      '/cars/brands': [{ code: '21', name: 'Fiat' }, { code: '23', name: 'GM - Chevrolet' }],
      '/cars/brands/23/models': [{ code: '5940', name: 'Onix Hatch LT 1.0 8V Flex 5p Mec.' }, { code: '5941', name: 'Onix Sedan Plus Premier 1.0 Turbo Aut.' }, { code: '926', name: 'A-10 2.5/4.1' }],
      '/cars/brands/23/models/5940/years': [{ code: '2019-1', name: '2019 Gasolina' }, { code: '2018-1', name: '2018 Gasolina' }],
      '/cars/brands/23/models/5940/years/2019-1': { vehicleType: 1, price: 'R$ 58.700,00', brand: 'GM - Chevrolet', model: 'Onix Hatch LT 1.0 8V Flex 5p Mec.', modelYear: 2019, fuel: 'Gasolina', codeFipe: '004431-7', referenceMonth: 'outubro de 2026' },
    };
    const hit = R[f[1].split('?')[0]];
    if (!hit) { res.statusCode = 404; return res.end('{}'); }
    return res.end(JSON.stringify(hit));
  }
  const m = req.url.match(/^\/consulta\/([A-Z0-9]{7})\/(.+)$/);
  res.setHeader('content-type', 'application/json');
  if (!m) { res.statusCode = 404; return res.end('{}'); }
  if (m[1] === 'AAA0000') return res.end(JSON.stringify({ mensagemRetorno: 'Placa não encontrada' }));
  res.end(JSON.stringify({
    MARCA: 'HONDA', MODELO: 'CIVIC LXS 1.8', VERSAO: 'LXS', ano: '2011', anoModelo: '2012', cor: 'Preta', uf: 'SP', municipio: 'CAMPINAS', situacao: 'Em circulação',
    fipe: { dados: [
      { texto_valor: 'R$ 52.400,00', codigo_fipe: '014074-7', texto_modelo: 'Civic Sedan LXS 1.8/1.8 Flex 16V Aut. 4p', ano_modelo: '2012', mes_referencia: 'outubro de 2026', score: 92 },
      { texto_valor: 'R$ 49.900,00', codigo_fipe: '014075-5', texto_modelo: 'Civic Sedan LXL 1.8 Flex', ano_modelo: '2012', mes_referencia: 'outubro de 2026', score: 70 },
    ] },
  }));
}).listen(Number(process.argv[2] || 3999), '127.0.0.1');
