// Símbolo do sistema de gincanas: três barras formando um pódio, nas cores da marca
// Piras na Física. Substitui o logo da gincana da Copa, que era de um evento só.
//
// Vai INLINE no HTML, e não como arquivo de imagem, por três motivos: acompanha o
// tema claro/escuro, não custa uma requisição e fica nítido em qualquer tamanho.
// As cores saem de classes (m1/m2/m3) definidas em comum/estilo.css, porque sobre o
// azul-escuro do cabeçalho os tons precisam ser mais claros do que sobre o creme.
//
// Trocar o desenho é mexer só neste arquivo.
export function marcaSvg(tamanho = 26) {
  return `<svg class="marca" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24"
     role="img" aria-label="Gincanas do Piras na Física">
  <rect class="m1" x="1"   y="12" width="6" height="10" rx="1.6"/>
  <rect class="m2" x="8.5" y="4"  width="7" height="18" rx="1.6"/>
  <rect class="m3" x="17"  y="15" width="6" height="7"  rx="1.6"/>
</svg>`
}
