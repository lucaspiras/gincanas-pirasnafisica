// Tema claro/escuro do site.
// Carregado de forma síncrona no <head> para aplicar o tema antes da pintura (sem "flash").
// A escolha vai também para um cookie em .pirasnafisica.com.br, para valer entre
// os subdomínios (o localStorage é por origem). Valores: 'escuro' | 'claro'.
(function () {
  var DOMINIO = /(^|\.)pirasnafisica\.com\.br$/.test(location.hostname)
    ? '; domain=.pirasnafisica.com.br' : '';

  function lerCookie() {
    var m = document.cookie.match(/(?:^|;\s*)tema=(escuro|claro)/);
    return m ? m[1] : null;
  }

  function gravarCookie(valor) {
    try {
      document.cookie = 'tema=' + valor + DOMINIO + '; path=/; max-age=31536000; SameSite=Lax';
    } catch (e) {}
  }

  var salvo = lerCookie();
  if (!salvo) { try { salvo = localStorage.getItem('tema'); } catch (e) {} }
  var escuro = salvo
    ? salvo === 'escuro'
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (escuro) document.documentElement.setAttribute('data-theme', 'dark');

  function atualizarIcone() {
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = document.documentElement.hasAttribute('data-theme') ? '☀️' : '🌙';
  }

  // Delegação: o botão chega depois, via fetch do header
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#theme-toggle');
    if (!btn) return;
    var html = document.documentElement;
    var novoEscuro = !html.hasAttribute('data-theme');
    if (novoEscuro) { html.setAttribute('data-theme', 'dark'); }
    else { html.removeAttribute('data-theme'); }
    try { localStorage.setItem('tema', novoEscuro ? 'escuro' : 'claro'); } catch (e2) {}
    gravarCookie(novoEscuro ? 'escuro' : 'claro');
    atualizarIcone();
  });

  document.addEventListener('DOMContentLoaded', function () {
    atualizarIcone();
    var alvo = document.getElementById('header');
    if (alvo && window.MutationObserver) {
      new MutationObserver(atualizarIcone).observe(alvo, { childList: true });
    }
  });
})();
