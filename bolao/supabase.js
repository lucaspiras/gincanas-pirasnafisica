import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL      = 'https://zmbgprapzgvpnmbtrakp.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Zh1Kq8RsRjK1OUiGsVTVkw_AhkMK275'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/* ── Auth helpers ──────────────────────────────────────────── */

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function requireAuth(redirectTo = 'login.html') {
  const user = await getUser()
  if (!user) { location.href = redirectTo; return null }
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

export async function requireAuthWithProfile(redirectTo = 'login.html') {
  const user = await requireAuth(redirectTo)
  if (!user) return null
  const profile = await getProfile(user.id)
  // No novo modelo, a conta e o perfil são criados juntos pelo admin.
  // Uma conta sem perfil é um estado anômalo: encerra a sessão e volta ao login.
  if (!profile) { await supabase.auth.signOut(); location.href = 'login.html'; return null }
  return { user, profile }
}

export async function requireAdmin() {
  const result = await requireAuthWithProfile()
  if (!result) return null
  if (!result.profile.is_admin) { location.href = 'dashboard.html'; return null }
  return result
}

export async function signOut() {
  await supabase.auth.signOut()
  location.href = 'login.html'
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

/* ── UI helpers ────────────────────────────────────────────── */

export function renderHeader(profile, showAdmin = false) {
  const adminLink = (showAdmin && profile.is_admin)
    ? `<a href="admin.html" class="header-link">Admin</a>`
    : ''
  const avatar = escHtml(profile.avatar || '⚽')
  return `
    <header class="header">
      <div class="header-inner">
        <a href="dashboard.html" class="header-brand"><img class="header-logo" src="logo_bolao_novo.png" alt="">Bolão</a>
        <div class="header-right">
          ${adminLink}
          <a href="profile.html" class="header-user-link" title="Meu perfil">
            <span class="header-avatar">${avatar}</span>
            <span class="header-name">${escHtml(profile.display_name)}</span>
          </a>
          <button class="btn-signout" id="btn-signout">Sair</button>
        </div>
      </div>
    </header>`
}

export function renderPoolNav(poolId, activePage) {
  const items = [
    { id: 'palpites', label: 'Palpites',  href: `pool.html?id=${poolId}` },
    { id: 'grupos',   label: 'Grupos',    href: `standings.html?pool=${poolId}` },
    { id: 'podio',    label: '🏆 Pódio', href: `tournament.html?pool=${poolId}` },
  ]
  return `<nav class="pool-nav">
    ${items.map(i => `<a href="${i.href}" class="pool-nav-item${i.id === activePage ? ' active' : ''}">${i.label}</a>`).join('')}
  </nav>`
}

export function bindSignOut() {
  document.getElementById('btn-signout')?.addEventListener('click', signOut)
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit'
  })
}

export function fmtDateTime(iso) {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`
}

// Apostas dos jogos fecham 2h antes do horário previsto da partida.
export const BETTING_LOCK_MS = 2 * 60 * 60 * 1000
// Apostas dos outros membros ficam visíveis 1h antes do início.
export const PREDICTIONS_REVEAL_MS = 1 * 60 * 60 * 1000

export function matchStatus(match) {
  const kickoff = new Date(match.match_date).getTime()
  const now = Date.now()
  if (match.status === 'finished') return 'closed'
  if (match.status === 'live')     return 'live'
  if (now >= kickoff)              return 'live'
  // Janela entre 2h antes e o início: apostas encerradas, jogo ainda não começou.
  if (now >= kickoff - BETTING_LOCK_MS) return 'locked'
  return 'open'
}

export function statusBadge(status) {
  if (status === 'open')   return '<span class="badge badge-open">Aberto</span>'
  if (status === 'locked') return '<span class="badge badge-closed">Apostas encerradas</span>'
  if (status === 'live')   return '<span class="badge badge-live">Ao vivo</span>'
  return '<span class="badge badge-closed">Encerrado</span>'
}

/* ── Regras de pontuação ───────────────────────────────────── */
const DEFAULT_RULES = {
  exact_score: 10, exact_home: 2, exact_away: 2,
  correct_result: 4, correct_diff: 2,
  cls_1st: 8, cls_2nd: 6, cls_3rd: 3, cls_4th: 1,
  cls_qualify: 4, cls_exact: 10, cls_best3rd: 5,
  tourn_1st: 100, tourn_2nd: 50, tourn_3rd: 25, tourn_bonus: 225,
  ko_exact_home: 4, ko_exact_away: 4, ko_correct_result: 8, ko_correct_diff: 4, ko_exact_score: 20
}

export async function getRules(poolId) {
  if (!poolId) return { ...DEFAULT_RULES }
  const { data } = await supabase
    .from('pool_scoring_rules').select('*').eq('pool_id', poolId).maybeSingle()
  return data ?? { ...DEFAULT_RULES }
}

export const MATCH_RULE_LABELS = {
  exact_home:     'Acertar o número de gols da equipe 1',
  exact_away:     'Acertar o número de gols da equipe 2',
  correct_result: 'Resultado correto (vitória / empate)',
  correct_diff:   'Saldo de gols correto',
  exact_score:    'Bônus: placar exato (as duas equipes)',
}
export const KO_RULE_LABELS = {
  ko_exact_home:     'Acertar o número de gols da equipe 1',
  ko_exact_away:     'Acertar o número de gols da equipe 2',
  ko_correct_result: 'Acertar o time que avança (vitória ou pênaltis)',
  ko_correct_diff:   'Saldo de gols correto',
  ko_exact_score:    'Bônus: placar exato (as duas equipes)',
}
export const CLS_RULE_LABELS = {
  cls_1st:     '1º colocado do grupo correto',
  cls_2nd:     '2º colocado do grupo correto',
  cls_3rd:     '3º colocado do grupo correto',
  cls_4th:     '4º colocado do grupo correto',
  cls_qualify: 'Bônus: acertou os 2 classificados (sem ordem)',
  cls_exact:   'Bônus: classificação exata (todos os 4)',
  cls_best3rd: 'Melhor 3º colocado avançou (por grupo)',
}
export const TOURN_RULE_LABELS = {
  tourn_1st:   'Acertar o campeão (1º lugar)',
  tourn_2nd:   'Acertar o vice-campeão (2º lugar)',
  tourn_3rd:   'Acertar o 3º lugar',
  tourn_bonus: 'Bônus: pódio exato (os 3 corretos)',
}
export const RULE_LABELS = { ...MATCH_RULE_LABELS, ...CLS_RULE_LABELS }

/* ── Simulação de classificação do grupo ───────────────────── */
export function simulateGroupStandings(groupMatches, predsMap) {
  const teams = {}
  const played = []   // jogos com placar, para calcular o confronto direto
  for (const m of groupMatches) {
    for (const t of [m.home_team, m.away_team]) {
      if (!teams[t]) teams[t] = { team: t, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, played: 0 }
    }
  }
  for (const m of groupMatches) {
    const pred = predsMap[m.id]
    if (!pred || pred.home_score == null || pred.away_score == null) continue
    const h = Number(pred.home_score), a = Number(pred.away_score)
    if (isNaN(h) || isNaN(a)) continue
    const ht = teams[m.home_team], at = teams[m.away_team]
    ht.gf += h; ht.ga += a; ht.gd += h - a; ht.played++
    at.gf += a; at.ga += h; at.gd += a - h; at.played++
    if (h > a)      { ht.pts += 3; ht.w++; at.l++ }
    else if (h < a) { at.pts += 3; at.w++; ht.l++ }
    else            { ht.pts += 1; ht.d++; at.pts += 1; at.d++ }
    played.push({ home: m.home_team, away: m.away_team, hs: h, as: a })
  }
  return rankGroupFifa(Object.values(teams), played)
}

// Ordena as equipes de um grupo pelos critérios de desempate da FIFA 2026:
//   1) pontos no total
//   2) confronto direto entre as EMPATADAS: pontos → saldo → gols nos jogos entre elas
//   3) saldo de gols geral
//   4) gols marcados geral
//   (fair play não é simulado — exigiria dados de cartões)
//   5) nome da equipe — desempate final determinístico, no lugar do sorteio
// `played` é a lista de jogos com placar: { home, away, hs, as }.
export function rankGroupFifa(teamList, played) {
  // Estatísticas de confronto direto restritas a um subconjunto de equipes
  // (só contam os jogos em que AMBOS os times estão no subconjunto).
  const h2hStats = (subset) => {
    const names = new Set(subset.map(t => t.team))
    const acc = {}
    for (const t of subset) acc[t.team] = { pts: 0, gd: 0, gf: 0 }
    for (const g of played) {
      if (!names.has(g.home) || !names.has(g.away)) continue
      const H = acc[g.home], A = acc[g.away]
      H.gf += g.hs; A.gf += g.as
      H.gd += g.hs - g.as; A.gd += g.as - g.hs
      if (g.hs > g.as) H.pts += 3
      else if (g.hs < g.as) A.pts += 3
      else { H.pts += 1; A.pts += 1 }
    }
    return acc
  }
  return [...teamList].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    // Empate em pontos: aplica confronto direto entre TODAS as equipes empatadas.
    const tied = teamList.filter(t => t.pts === a.pts)
    if (tied.length > 1) {
      const hh = h2hStats(tied)
      const ha = hh[a.team], hb = hh[b.team]
      if (hb.pts !== ha.pts) return hb.pts - ha.pts
      if (hb.gd  !== ha.gd ) return hb.gd  - ha.gd
      if (hb.gf  !== ha.gf ) return hb.gf  - ha.gf
    }
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return a.team.localeCompare(b.team)
  })
}

export async function saveGroupStandings(poolId, userId, groupName, groupMatches, predsMap) {
  const standings = simulateGroupStandings(groupMatches, predsMap)
  const rows = standings.slice(0, 4).map((s, i) => ({
    pool_id: poolId, user_id: userId, group_name: groupName,
    position: i + 1, team_name: s.team, updated_at: new Date().toISOString()
  }))
  for (const row of rows) {
    await supabase.from('predicted_group_standings')
      .upsert(row, { onConflict: 'pool_id,user_id,group_name,position' })
  }
}

/* ── Tradução de seleções ──────────────────────────────────── */
const TEAM_PT = {
  'Afghanistan': 'Afeganistão',
  'Albania': 'Albânia',
  'Algeria': 'Argélia',
  'Angola': 'Angola',
  'Argentina': 'Argentina',
  'Armenia': 'Armênia',
  'Australia': 'Austrália',
  'Austria': 'Áustria',
  'Azerbaijan': 'Azerbaijão',
  'Bahrain': 'Bahrein',
  'Bangladesh': 'Bangladesh',
  'Belgium': 'Bélgica',
  'Bolivia': 'Bolívia',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina',
  'Bosnia & Herzegovina': 'Bósnia e Herzegovina',
  'Bosnia-Herzegovina': 'Bósnia e Herzegovina',
  'Bosnia': 'Bósnia e Herzegovina',
  'Brazil': 'Brasil',
  'Bulgaria': 'Bulgária',
  'Cameroon': 'Camarões',
  'Canada': 'Canadá',
  'Chile': 'Chile',
  'China PR': 'China',
  'China': 'China',
  'Colombia': 'Colômbia',
  'Congo DR': 'Congo',
  'Costa Rica': 'Costa Rica',
  'Côte d\'Ivoire': 'Costa do Marfim',
  'Ivory Coast': 'Costa do Marfim',
  'Croatia': 'Croácia',
  'Cuba': 'Cuba',
  'Czechia': 'República Tcheca',
  'Czech Republic': 'República Tcheca',
  'Denmark': 'Dinamarca',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'El Salvador': 'El Salvador',
  'England': 'Inglaterra',
  'Estonia': 'Estônia',
  'Ethiopia': 'Etiópia',
  'Finland': 'Finlândia',
  'France': 'França',
  'Georgia': 'Geórgia',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Greece': 'Grécia',
  'Guatemala': 'Guatemala',
  'Guinea': 'Guiné',
  'Honduras': 'Honduras',
  'Hungary': 'Hungria',
  'Iceland': 'Islândia',
  'India': 'Índia',
  'Indonesia': 'Indonésia',
  'Iran': 'Irã',
  'Iraq': 'Iraque',
  'Ireland': 'Irlanda',
  'Israel': 'Israel',
  'Italy': 'Itália',
  'Jamaica': 'Jamaica',
  'Japan': 'Japão',
  'Jordan': 'Jordânia',
  'Kazakhstan': 'Cazaquistão',
  'Kenya': 'Quênia',
  'Kosovo': 'Kosovo',
  'Kuwait': 'Kuwait',
  'Latvia': 'Letônia',
  'Lebanon': 'Líbano',
  'Libya': 'Líbia',
  'Lithuania': 'Lituânia',
  'Luxembourg': 'Luxemburgo',
  'Malaysia': 'Malásia',
  'Mali': 'Mali',
  'Malta': 'Malta',
  'Mexico': 'México',
  'Moldova': 'Moldávia',
  'Montenegro': 'Montenegro',
  'Morocco': 'Marrocos',
  'Mozambique': 'Moçambique',
  'Netherlands': 'Holanda',
  'New Caledonia': 'Nova Caledônia',
  'New Zealand': 'Nova Zelândia',
  'Nigeria': 'Nigéria',
  'North Korea': 'Coreia do Norte',
  'North Macedonia': 'Macedônia do Norte',
  'Northern Ireland': 'Irlanda do Norte',
  'Norway': 'Noruega',
  'Oman': 'Omã',
  'Palestine': 'Palestina',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguai',
  'Peru': 'Peru',
  'Philippines': 'Filipinas',
  'Poland': 'Polônia',
  'Portugal': 'Portugal',
  'Qatar': 'Catar',
  'Romania': 'Romênia',
  'Russia': 'Rússia',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'Serbia': 'Sérvia',
  'Slovakia': 'Eslováquia',
  'Slovenia': 'Eslovênia',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Spain': 'Espanha',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Syria': 'Síria',
  'Taiwan': 'Taiwan',
  'Thailand': 'Tailândia',
  'Togo': 'Togo',
  'Trinidad and Tobago': 'Trinidad e Tobago',
  'Tunisia': 'Tunísia',
  'Turkey': 'Turquia',
  'Türkiye': 'Turquia',
  'Uganda': 'Uganda',
  'Ukraine': 'Ucrânia',
  'United Arab Emirates': 'Emirados Árabes Unidos',
  'United States': 'Estados Unidos',
  'Uruguay': 'Uruguai',
  'Uzbekistan': 'Uzbequistão',
  'Venezuela': 'Venezuela',
  'Vietnam': 'Vietnã',
  'Wales': 'País de Gales',
  'Zambia': 'Zâmbia',
  'Zimbabwe': 'Zimbábue',
  'Cape Verde Islands': 'Cabo Verde',
  'Cape Verde': 'Cabo Verde',
  'Curaçao': 'Curaçao',
  'Curacao': 'Curaçao',
  'Haiti': 'Haiti',
  'Suriname': 'Suriname',
  'TBD': 'A definir',
}

export function translateTeam(name) {
  return TEAM_PT[name] ?? name
}

/* ── Bandeiras (código ISO 3166-1 alpha-2 para flagcdn.com) ─────────────────
   Usamos imagens (não emoji), porque emoji de bandeira não renderiza no
   Windows. As seleções do Reino Unido usam os códigos gb-eng/sct/wls/nir. */
const TEAM_ISO = {
  'Afghanistan': 'af', 'Albania': 'al', 'Algeria': 'dz', 'Angola': 'ao',
  'Argentina': 'ar', 'Armenia': 'am', 'Australia': 'au', 'Austria': 'at',
  'Azerbaijan': 'az', 'Bahrain': 'bh', 'Bangladesh': 'bd', 'Belgium': 'be',
  'Bolivia': 'bo', 'Bosnia and Herzegovina': 'ba', 'Bosnia & Herzegovina': 'ba',
  'Bosnia-Herzegovina': 'ba', 'Bosnia': 'ba', 'Brazil': 'br', 'Bulgaria': 'bg',
  'Cameroon': 'cm', 'Canada': 'ca', 'Cape Verde Islands': 'cv', 'Cape Verde': 'cv',
  'Chile': 'cl', 'China PR': 'cn', 'China': 'cn', 'Colombia': 'co', 'Congo DR': 'cd',
  'Costa Rica': 'cr', "Côte d'Ivoire": 'ci', 'Ivory Coast': 'ci', 'Croatia': 'hr',
  'Cuba': 'cu', 'Curaçao': 'cw', 'Curacao': 'cw', 'Czechia': 'cz', 'Czech Republic': 'cz',
  'Denmark': 'dk', 'Ecuador': 'ec', 'Egypt': 'eg', 'El Salvador': 'sv',
  'England': 'gb-eng', 'Estonia': 'ee', 'Ethiopia': 'et', 'Finland': 'fi',
  'France': 'fr', 'Georgia': 'ge', 'Germany': 'de', 'Ghana': 'gh', 'Greece': 'gr',
  'Guatemala': 'gt', 'Guinea': 'gn', 'Haiti': 'ht', 'Honduras': 'hn', 'Hungary': 'hu',
  'Iceland': 'is', 'India': 'in', 'Indonesia': 'id', 'Iran': 'ir', 'Iraq': 'iq',
  'Ireland': 'ie', 'Israel': 'il', 'Italy': 'it', 'Jamaica': 'jm', 'Japan': 'jp',
  'Jordan': 'jo', 'Kazakhstan': 'kz', 'Kenya': 'ke', 'Kosovo': 'xk', 'Kuwait': 'kw',
  'Latvia': 'lv', 'Lebanon': 'lb', 'Libya': 'ly', 'Lithuania': 'lt', 'Luxembourg': 'lu',
  'Malaysia': 'my', 'Mali': 'ml', 'Malta': 'mt', 'Mexico': 'mx', 'Moldova': 'md',
  'Montenegro': 'me', 'Morocco': 'ma', 'Mozambique': 'mz', 'Netherlands': 'nl',
  'New Caledonia': 'nc', 'New Zealand': 'nz', 'Nigeria': 'ng', 'North Korea': 'kp',
  'North Macedonia': 'mk', 'Northern Ireland': 'gb-nir', 'Norway': 'no', 'Oman': 'om',
  'Palestine': 'ps', 'Panama': 'pa', 'Paraguay': 'py', 'Peru': 'pe', 'Philippines': 'ph',
  'Poland': 'pl', 'Portugal': 'pt', 'Qatar': 'qa', 'Romania': 'ro', 'Russia': 'ru',
  'Saudi Arabia': 'sa', 'Scotland': 'gb-sct', 'Senegal': 'sn', 'Serbia': 'rs',
  'Slovakia': 'sk', 'Slovenia': 'si', 'South Africa': 'za', 'South Korea': 'kr',
  'Spain': 'es', 'Suriname': 'sr', 'Sweden': 'se', 'Switzerland': 'ch', 'Syria': 'sy',
  'Taiwan': 'tw', 'Thailand': 'th', 'Togo': 'tg', 'Trinidad and Tobago': 'tt',
  'Tunisia': 'tn', 'Turkey': 'tr', 'Türkiye': 'tr', 'Uganda': 'ug', 'Ukraine': 'ua',
  'United Arab Emirates': 'ae', 'United States': 'us', 'Uruguay': 'uy',
  'Uzbekistan': 'uz', 'Venezuela': 've', 'Vietnam': 'vn', 'Wales': 'gb-wls',
  'Zambia': 'zm', 'Zimbabwe': 'zw',
}

/* ── Rótulos de fase do mata-mata ───────────────────────────────────────── */
const KO_ROUND_PT = {
  'LAST_32': 'Rodada das 32', 'LAST32': 'Rodada das 32', 'R32': 'Rodada das 32',
  'LAST_16': 'Oitavas de Final', 'LAST16': 'Oitavas de Final', 'R16': 'Oitavas de Final',
  'ROUND_OF_16': 'Oitavas de Final', 'ROUND_OF_32': 'Rodada das 32',
  'QUARTER_FINALS': 'Quartas de Final', 'QUARTER-FINALS': 'Quartas de Final',
  'QUARTERFINALS': 'Quartas de Final', 'QF': 'Quartas de Final',
  'SEMI_FINALS': 'Semifinal', 'SEMI-FINALS': 'Semifinal',
  'SEMIFINAL': 'Semifinal', 'SEMIFINALS': 'Semifinal', 'SF': 'Semifinal',
  'THIRD_PLACE': '3º Lugar', 'THIRD-PLACE': '3º Lugar', '3RD': '3º Lugar', '3P': '3º Lugar',
  'FINAL': 'Final', 'F': 'Final',
}

export function koRoundLabel(groupName) {
  if (!groupName) return 'Mata-mata'
  return KO_ROUND_PT[groupName.toUpperCase().replace(/ /g, '_')] ?? groupName
}

// Rótulo curto para a meta da partida (ex.: "Grupo A", "Quartas de Final").
export function matchMetaLabel(m) {
  if (!m || m.phase === 'group') return `Grupo ${m?.group_name ?? '?'}`
  return koRoundLabel(m.group_name)
}

// Retorna a tag <img> da bandeira do time, ou '' se desconhecido (ex.: 'TBD').
export function teamFlag(name) {
  const code = TEAM_ISO[name]
  if (!code) return ''
  return `<img class="flag" src="https://flagcdn.com/h20/${code}.png" `
    + `srcset="https://flagcdn.com/h40/${code}.png 2x" alt="" loading="lazy">`
}

export function medalIcon(pos) {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  if (pos === 3) return '🥉'
  return pos
}
