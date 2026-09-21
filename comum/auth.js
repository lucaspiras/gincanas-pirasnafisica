import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import { marcaSvg } from './marca.js'

export { marcaSvg }

const SUPABASE_URL      = 'https://zmbgprapzgvpnmbtrakp.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Zh1Kq8RsRjK1OUiGsVTVkw_AhkMK275'

// Cliente único do sistema de gincanas. Sem storageKey próprio: a sessão é a mesma
// em todas as páginas (bolão, gincana da Copa e pastas novas), na mesma origem.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/* ── Destinos ──────────────────────────────────────────────── */

// A raiz do site é a pasta que contém `comum/`, calculada a partir do próprio módulo.
// Assim as páginas funcionam tanto no domínio (raiz = "/") quanto num servidor local
// cuja raiz seja a pasta de cima (Live Server na pasta geral: "/gincanas/").
export const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/*$/, '/')
export const ENTRAR_URL = RAIZ + 'entrar.html'
export const PAINEL_URL = RAIZ + 'painel.html'

// Caminho de dentro do site (ex.: 'bolao/admin.html') para URL utilizável.
export function doSite(caminho) {
  return RAIZ + String(caminho ?? '').replace(/^\/+/, '')
}

// Aceita só caminho relativo ao próprio site. Recusa '//host', 'http:', 'javascript:' etc.
export function caminhoSeguro(valor) {
  if (typeof valor !== 'string' || !valor) return null
  let v = valor
  try { v = decodeURIComponent(valor) } catch { return null }
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || /[\r\n\t]/.test(v)) return null
  return v
}

// Endereço do login geral, voltando para a página atual depois de entrar.
// O redirect é o caminho real do navegador, então já inclui o prefixo local, se houver.
export function urlDeLogin() {
  return `${ENTRAR_URL}?redirect=${encodeURIComponent(location.pathname + location.search)}`
}

// Nome da pasta da gincana (o slug), a partir do caminho da página:
// /<slug>/index.html no domínio, /gincanas/<slug>/index.html no servidor local.
export function slugDaPasta() {
  const partes = location.pathname.split('/').filter(Boolean)
  if (partes.length && partes[partes.length - 1].includes('.')) partes.pop()
  return partes[partes.length - 1] ?? ''
}

/* ── Auth ──────────────────────────────────────────────────── */

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// O parâmetro existe por compatibilidade: as páginas antigas passam 'login.html',
// que agora só redireciona. O destino real é sempre o login geral.
export async function requireAuth(redirectTo) {
  const user = await getUser()
  if (!user) {
    const legado = !redirectTo || redirectTo === 'login.html'
    location.href = legado ? urlDeLogin() : redirectTo
    return null
  }
  return user
}

export async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, avatar')
    .eq('id', userId)
    .maybeSingle()
  return data
}

export async function requireAuthWithProfile(redirectTo) {
  const user = await requireAuth(redirectTo)
  if (!user) return null
  const profile = await getProfile(user.id)
  // A conta e o perfil são criados juntos pelo administrador. Conta sem perfil é
  // estado anômalo: encerra a sessão e volta ao login.
  if (!profile) { await supabase.auth.signOut(); location.href = ENTRAR_URL; return null }
  return { user, profile }
}

export async function requireAdmin() {
  const result = await requireAuthWithProfile()
  if (!result) return null
  if (!result.profile.is_admin) { location.href = PAINEL_URL; return null }
  return result
}

export async function signOut() {
  await supabase.auth.signOut()
  location.href = ENTRAR_URL
}

/* ── Painel admin (Edge Function) ──────────────────────────── */
// Chama a Edge Function `admin`, que guarda a service_role no servidor e confere
// is_admin do chamador. O JWT do usuário é anexado automaticamente pelo invoke.
// Lança Error com mensagem amigável em caso de falha.
export async function callAdmin(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('admin', {
    body: { action, ...payload }
  })
  if (error) {
    // Erros HTTP (4xx/5xx) trazem o corpo em error.context
    let msg = error.message
    try { msg = (await error.context?.json())?.error ?? msg } catch {}
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/* ── Utilidades ────────────────────────────────────────────── */

// Mensagem clara quando o banco ainda não recebeu o SQL do sistema de gincanas
// (tabela ou função inexistente), em vez do erro cru do PostgREST.
export function explicarErro(error) {
  const msg = error?.message ?? String(error ?? '')
  const cod = error?.code ?? ''
  if (cod === 'PGRST202' || cod === '42P01' || cod === '42883'
      || /could not find the (function|table)|does not exist|schema cache/i.test(msg)) {
    return 'O banco ainda não tem as tabelas e funções do sistema de gincanas. '
         + 'Rode no SQL Editor do Supabase os arquivos de supabase/sql/gincana-sistema (00 a 05). '
         + 'Detalhe técnico: ' + msg
  }
  return msg
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

export function fmtData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Curta, para caber em coluna de tabela sem quebrar linha.
export function fmtDataCurta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export const AVATARS = [
  '🎯','🏆','🥇','⚽','⭐','🔥','🌟','💪',
  '🦁','🐯','🦅','🐉','🎪','⚡','🌎','🏅',
  '🎮','🎭','🤩','😎','🤙','🦊','🐺','🦄',
  '♟️','🎓','📚','🧪','🔭','🚀','🧲','💡',
]

// Cabeçalho comum às páginas novas (painel, perfil, admin).
export function renderCabecalho(profile, ativo = '') {
  const link = (id, href, rotulo) =>
    `<a href="${href}" class="header-link${ativo === id ? ' ativo' : ''}">${rotulo}</a>`
  const admin = profile.is_admin
    ? link('gincanas', doSite('admin/index.html'), 'Gincanas') + link('perfis', doSite('admin/perfis.html'), 'Perfis')
    : ''
  return `
    <header class="header">
      <div class="header-inner">
        <a href="${PAINEL_URL}" class="header-brand">${marcaSvg(26)}Gincanas</a>
        <div class="header-right">
          ${link('painel', PAINEL_URL, 'Minhas gincanas')}
          ${admin}
          <a href="${doSite('perfil.html')}" class="header-user-link" title="Meu perfil">
            <span class="header-avatar">${escHtml(profile.avatar || '⚽')}</span>
            <span class="header-name">${escHtml(profile.display_name)}</span>
          </a>
          <button class="btn-tema" id="theme-toggle" type="button" title="Alternar tema" aria-label="Alternar tema">🌙</button>
          <button class="btn-signout" id="btn-signout">Sair</button>
        </div>
      </div>
    </header>`
}

export function bindSignOut() {
  document.getElementById('btn-signout')?.addEventListener('click', signOut)
}
