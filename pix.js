/*
 * pix.js - leitura e validacao do "Pix Copia e Cola" (BR Code / EMV MPM).
 * Funcoes puras, sem acesso a rede nem ao armazenamento.
 */
'use strict';

const Pix = (() => {
  // CRC16/CCITT-FALSE (polinomio 0x1021, inicial 0xFFFF), calculado sobre os
  // bytes UTF-8 do payload incluindo "6304". E o exigido pelo manual do BR Code.
  function crc16(texto) {
    const bytes = new TextEncoder().encode(texto);
    let crc = 0xFFFF;
    for (const b of bytes) {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  // Le uma sequencia TLV (id 2 digitos + tamanho 2 digitos + valor).
  // pararNo63: no nivel principal o campo 63 (CRC) encerra o codigo.
  function lerTLV(s, inicio, pararNo63) {
    const campos = {};
    let pos = inicio;
    let fechou = false;
    while (pos < s.length) {
      const id = s.substr(pos, 2);
      const tam = s.substr(pos + 2, 2);
      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tam)) {
        if (pararNo63) throw new Error('Trecho inválido perto do caractere ' + (pos - inicio + 1) + '.');
        break;
      }
      const n = parseInt(tam, 10);
      const valor = s.substr(pos + 4, n);
      if (valor.length < n) throw new Error('Código cortado: o campo ' + id + ' terminou antes do esperado.');
      campos[id] = valor;
      pos += 4 + n;
      if (pararNo63 && id === '63') { fechou = true; break; }
    }
    return { campos, fim: pos, fechou };
  }

  function normalizar(texto) {
    // Quebras de linha e caracteres invisiveis aparecem ao copiar de apps e PDF.
    return String(texto || '')
      .replace(/[\r\n\t​-‍⁠﻿]/g, '')
      .trim();
  }

  /*
   * Recebe o texto colado ou compartilhado e devolve:
   * { ok, erro, codigo, crcOk, crcInformado, crcCalculado, tipo, modalidade,
   *   chave, url, infoAdicional, valor, recebedor, cidade, txid }
   */
  function analisar(texto) {
    const s = normalizar(texto);
    if (!s) return { ok: false, erro: 'Cole ou compartilhe um código Pix.' };

    const inicio = s.indexOf('000201');
    if (inicio < 0) return { ok: false, erro: 'Não encontrei um código Pix no texto (ele começa com 000201).' };

    let lido;
    try {
      lido = lerTLV(s, inicio, true);
    } catch (e) {
      return { ok: false, erro: e.message };
    }
    if (!lido.fechou) return { ok: false, erro: 'Código incompleto: falta o final (campo 6304 + CRC).' };

    const c = lido.campos;
    const codigo = s.slice(inicio, lido.fim);

    // Conta do recebedor: um dos campos 26..51 com GUI br.gov.bcb.pix
    let conta = null;
    for (let i = 26; i <= 51; i++) {
      const v = c[String(i)];
      if (!v) continue;
      try {
        const sub = lerTLV(v, 0, false).campos;
        if ((sub['00'] || '').toLowerCase() === 'br.gov.bcb.pix') { conta = sub; break; }
      } catch (e) { /* ignora template malformado e tenta o proximo */ }
    }
    if (!conta) return { ok: false, erro: 'O código não é de Pix (falta o identificador br.gov.bcb.pix).' };

    let adicional = {};
    if (c['62']) {
      try { adicional = lerTLV(c['62'], 0, false).campos; } catch (e) { adicional = {}; }
    }

    const crcInformado = (c['63'] || '').toUpperCase();
    const crcCalculado = crc16(codigo.slice(0, -4));
    const url = conta['25'] || '';

    let modalidade = '';
    if (/\/cobv\//i.test(url)) modalidade = 'cobrança com vencimento';
    else if (/\/cob\//i.test(url)) modalidade = 'cobrança imediata';

    return {
      ok: true,
      codigo,
      crcOk: crcInformado === crcCalculado,
      crcInformado,
      crcCalculado,
      tipo: c['01'] === '12' ? 'dinâmico' : 'estático',
      modalidade,
      chave: conta['01'] || '',
      url,
      infoAdicional: conta['02'] || '',
      valor: c['54'] || '',
      recebedor: c['59'] || '',
      cidade: c['60'] || '',
      txid: adicional['05'] || '',
      sobrouTexto: s.length > lido.fim
    };
  }

  return { analisar, crc16, normalizar };
})();

if (typeof module !== 'undefined') module.exports = Pix;
