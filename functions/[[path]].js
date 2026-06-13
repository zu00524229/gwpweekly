// ─────────────────────────────────────────────
//  AI週報.EXE — Cloudflare Pages Function
//  GET /                → 顯示最新週報
//  GET /?week=xxx       → 顯示指定週報
//  GET /api/refresh     → 觸發 RSS 抓取
// ─────────────────────────────────────────────

const RSS_SOURCES = [
  { name: '機器之心', url: 'https://www.jiqizhixin.com/rss' },
  { name: '量子位',   url: 'https://www.qbitai.com/feed' },
  { name: '36氪',    url: 'https://36kr.com/feed' },
  { name: '科技新報', url: 'https://technews.tw/feed' },
  { name: 'iThome',  url: 'https://www.ithome.com.tw/rss' },
];

const AI_KEYWORDS = [
  'AI', '人工智慧', '機器學習', '深度學習', '大模型', 'LLM',
  'GPT', 'Claude', 'Gemini', '神經網路', '生成式', 'ChatGPT',
  '語言模型', 'Transformer', '算力', '推理模型', 'DeepSeek',
];

const CATEGORIES = {
  '大模型':   ['GPT', 'Claude', 'Gemini', 'LLM', '大模型', '語言模型', 'Llama', 'Mistral', '文心', '通義', '豆包', 'Grok', 'DeepSeek', 'o1', 'o3', '推理模型'],
  '研究突破': ['論文', 'arXiv', '研究', '突破', '架構', '實驗室', 'Transformer', '算法', '訓練', '參數'],
  '產業動態': ['融資', '收購', '裁員', '上市', '晶片', '台積電', 'NVIDIA', '投資', '合作', '估值', '億元', '億美元'],
  '政策法規': ['法規', '監管', '政策', '禁令', '合規', 'EU AI', '人工智慧法', '治理', '倫理', '草案'],
  '工具應用': ['更新', '插件', 'API', '應用', '助理', '工具', '產品', '功能', '平台', '發布'],
};

const CAT_COLOR = {
  '大模型':   '#00f0ff',
  '研究突破': '#a78bfa',
  '產業動態': '#34d399',
  '政策法規': '#ffd700',
  '工具應用': '#fb923c',
};

// ── Pages Function 入口 ────────────────────────

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    if (!env.GWP_WEEKLY) {
      return new Response(
        '尚未綁定 KV Namespace。\n請至 Cloudflare Pages → Settings → Functions → KV namespace bindings\n新增 Variable name = GWP_WEEKLY',
        { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    // /api/refresh — 觸發 RSS 抓取
    if (url.pathname === '/api/refresh') {
      await fetchAndStore(env);
      return new Response('OK — 新聞已更新', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // / 或 /?week=xxx — 顯示週報
    const weekKey  = url.searchParams.get('week');
    const index    = (await env.GWP_WEEKLY.get('weeks-index', { type: 'json' })) || [];
    const current  = weekKey || index[0]?.key || null;
    const weekData = current ? await env.GWP_WEEKLY.get(current, { type: 'json' }) : null;

    return new Response(renderHTML(weekData, index, current), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}\n\n${e.stack}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// ── RSS 抓取與儲存 ─────────────────────────────

async function fetchAndStore(env) {
  const now = new Date();
  const { year, week } = isoWeek(now);
  const weekKey   = `week-${year}-${String(week).padStart(2, '0')}`;
  const dateRange = weekDateRange(now);

  const articles = [];
  for (const src of RSS_SOURCES) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GWPWeekly/1.0)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      for (const item of parseItems(xml)) {
        if (isAI(item.title, item.desc)) {
          articles.push({
            title:    item.title,
            summary:  cleanText(item.desc).slice(0, 160).trimEnd() + '…',
            source:   src.name,
            date:     fmtDate(item.pubDate),
            url:      item.link,
            category: categorize(item.title, item.desc),
          });
        }
      }
    } catch (e) {
      console.error(`[${src.name}] ${e.message}`);
    }
  }

  articles.sort((a, b) => (b.date > a.date ? 1 : -1));
  const top = articles.slice(0, 20).map((a, i) => ({ id: i + 1, ...a }));
  await env.GWP_WEEKLY.put(weekKey, JSON.stringify({ weekKey, year, week, dateRange, articles: top }));

  const idx = (await env.GWP_WEEKLY.get('weeks-index', { type: 'json' })) || [];
  const entry   = { key: weekKey, week, year, dateRange, count: top.length };
  const updated = [entry, ...idx.filter(x => x.key !== weekKey)].slice(0, 52);
  await env.GWP_WEEKLY.put('weeks-index', JSON.stringify(updated));
}

// ── RSS 解析 ───────────────────────────────────

function parseItems(xml) {
  const out = [];
  const re  = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const raw     = m[1];
    const title   = tag(raw, 'title');
    const link    = extractLink(raw);
    const desc    = tag(raw, 'description') || tag(raw, 'summary') || tag(raw, 'content');
    const pubDate = tag(raw, 'pubDate') || tag(raw, 'published') || tag(raw, 'updated');
    if (title && link) out.push({ title, link, desc, pubDate });
  }
  return out;
}

function tag(xml, t) {
  const m = xml.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

function extractLink(xml) {
  return (xml.match(/<link[^>]+href=["']([^"']+)["']/i) ||
          xml.match(/<link[^>]*>([^<]+)<\/link>/i) ||
          xml.match(/<guid[^>]*>([^<]+)<\/guid>/i) || [])[1]?.trim() || '';
}

function isAI(title = '', desc = '') {
  const t = (title + ' ' + desc).toLowerCase();
  return AI_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

function categorize(title = '', desc = '') {
  const t = title + ' ' + desc;
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    if (kws.some(k => t.includes(k))) return cat;
  }
  return '工具應用';
}

function cleanText(html = '') {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function fmtDate(s = '') {
  try { const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0, 10); } catch { return ''; }
}

function isoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return {
    year: d.getFullYear(),
    week: 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7),
  };
}

function weekDateRange(date) {
  const d   = new Date(date);
  const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const f   = x => `${x.getMonth() + 1}/${String(x.getDate()).padStart(2, '0')}`;
  return `${mon.getFullYear()}.${f(mon)} – ${f(fri)}`;
}

// ── HTML 輸出 ──────────────────────────────────

function renderHTML(weekData, index, currentKey) {
  const articles  = weekData?.articles  || [];
  const dateRange = weekData?.dateRange || '--';
  const week      = weekData?.week      || '--';

  const ticker = articles.length
    ? articles.map(a => `◆ ${a.source}：${a.title}`).join(' &nbsp;&nbsp;&nbsp; ')
    : '◆ 本週資料更新中，請稍候…';

  const articleHTML = articles.length
    ? articles.map(a => `
      <a class="article" href="${esc(a.url)}" target="_blank" rel="noopener">
        <div class="article-num">${String(a.id).padStart(2, '0')}</div>
        <div class="article-body">
          <div class="article-cat" style="color:${CAT_COLOR[a.category]||'#00f0ff'};text-shadow:0 0 8px ${CAT_COLOR[a.category]||'#00f0ff'}">◈ ${a.category}</div>
          <h3>${esc(a.title)}</h3>
          <p>${esc(a.summary)}</p>
          <div class="article-meta">
            <span class="src">${esc(a.source)}</span>
            <span class="date">${esc(a.date)}</span>
            <span class="read-more">閱讀原文 ►</span>
          </div>
        </div>
      </a>`).join('')
    : '<div class="empty">本週尚無 AI 新聞。<br>請呼叫 /api/refresh 更新資料。</div>';

  const sidebarHTML = index.length
    ? index.map(e => `
      <li class="week-item${e.key === currentKey ? ' active' : ''}">
        <a href="/?week=${e.key}" class="week-link">
          <div class="wi-num">W${e.week}</div>
          <div class="wi-date">${e.dateRange}</div>
          <div class="wi-count">${e.count} 則新聞</div>
        </a>
      </li>`).join('')
    : '<li class="week-item"><div class="wi-date" style="padding:14px 16px">尚無資料</div></li>';

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI週報.EXE</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Noto+Sans+TC:wght@400;700&display=swap">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050510;color:#e8e8ff;font-family:'Noto Sans TC',sans-serif;min-height:100vh}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.10) 2px,rgba(0,0,0,.10) 4px);pointer-events:none;z-index:999}
.header{background:#08082a;border-bottom:3px solid #00f0ff;padding:14px 24px;display:flex;align-items:center;gap:20px;position:sticky;top:0;z-index:50}
.logo{font-family:'Press Start 2P',monospace;font-size:14px;color:#00f0ff;text-shadow:0 0 10px #00f0ff,0 0 20px #00f0ff;white-space:nowrap;text-decoration:none}
.logo span{color:#ff2d78;text-shadow:0 0 10px #ff2d78}
.ticker{flex:1;overflow:hidden;white-space:nowrap;border-left:2px solid #1e1e4a;padding-left:20px}
.ticker-inner{display:inline-block;font-family:'Press Start 2P',monospace;font-size:11px;color:#ff2d78;text-shadow:0 0 6px #ff2d78;animation:ticker 80s linear infinite}
@keyframes ticker{0%{transform:translateX(80vw)}100%{transform:translateX(-100%)}}
.layout{display:grid;grid-template-columns:1fr 240px;max-width:1080px;margin:0 auto;padding:28px 20px;align-items:start}
.main{padding-right:28px}
.week-title{font-family:'Press Start 2P',monospace;font-size:12px;color:#ffd700;text-shadow:0 0 10px #ffd700;margin-bottom:24px;letter-spacing:2px;line-height:1.6}
.article{background:#0a0a20;border:2px solid #1e1e4a;padding:22px;margin-bottom:14px;cursor:pointer;transition:border-color .15s,box-shadow .15s;display:flex;gap:18px;align-items:flex-start;text-decoration:none}
.article:hover{border-color:#00f0ff;box-shadow:0 0 18px rgba(0,240,255,.28)}
.article-num{font-family:'Press Start 2P',monospace;font-size:12px;color:#2a2a5a;min-width:32px;padding-top:6px;transition:color .15s,text-shadow .15s}
.article:hover .article-num{color:#00f0ff;text-shadow:0 0 6px #00f0ff}
.article-body{flex:1}
.article-cat{font-family:'Press Start 2P',monospace;font-size:11px;margin-bottom:12px;display:inline-block}
.article h3{font-size:17px;color:#fff;font-weight:700;line-height:1.55;margin-bottom:10px}
.article p{font-size:14px;color:#b0b0d8;line-height:1.8;margin-bottom:14px}
.article-meta{display:flex;gap:14px;font-size:14px;align-items:center}
.src{color:#ff2d78;font-weight:700}
.date{color:#8888bb}
.read-more{font-family:'Press Start 2P',monospace;font-size:10px;color:#00f0ff;text-shadow:0 0 6px #00f0ff;opacity:0;transition:opacity .15s;margin-left:auto}
.article:hover .read-more{opacity:1}
.empty{font-family:'Press Start 2P',monospace;font-size:10px;color:#3a3a6a;text-align:center;padding:60px 0;line-height:2.5}
.sidebar{position:sticky;top:78px}
.sidebar-title{font-family:'Press Start 2P',monospace;font-size:11px;color:#a78bfa;text-shadow:0 0 6px #a78bfa;margin-bottom:18px;letter-spacing:1px}
.week-list{list-style:none}
.week-item{border-left:3px solid #1e1e4a;margin-bottom:6px;transition:border-color .15s,background .15s}
.week-item:hover,.week-item.active{border-left-color:#00f0ff;background:#0d0d2b}
.week-link{display:block;padding:14px 16px;text-decoration:none}
.wi-num{font-family:'Press Start 2P',monospace;font-size:11px;color:#4a4a7a;margin-bottom:7px;transition:color .15s}
.week-item:hover .wi-num,.week-item.active .wi-num{color:#00f0ff;text-shadow:0 0 6px #00f0ff}
.wi-date{font-size:14px;color:#8888bb}
.week-item.active .wi-date{color:#c8c8f0}
.wi-count{font-size:13px;color:#4a4a7a;margin-top:5px}
.week-item.active .wi-count{color:#8080b0}
hr{border:none;border-top:2px solid #1e1e4a;margin:16px 0}
.online-badge{font-family:'Press Start 2P',monospace;font-size:10px;color:#34d399;text-shadow:0 0 6px #34d399;text-align:center}
.blink{animation:blink 1s step-end infinite}
@keyframes blink{50%{opacity:0}}
@media(max-width:700px){.layout{grid-template-columns:1fr}.sidebar{position:static;margin-top:32px}.main{padding-right:0}}
</style>
</head>
<body>
<div class="header">
  <a class="logo" href="/">AI<span>週報</span>.EXE</a>
  <div class="ticker"><span class="ticker-inner">${ticker}</span></div>
</div>
<div class="layout">
  <main class="main">
    <div class="week-title">▶ 第 ${week} 週 · ${dateRange}</div>
    ${articleHTML}
  </main>
  <aside class="sidebar">
    <div class="sidebar-title">▶ 週報存檔</div>
    <ul class="week-list">${sidebarHTML}</ul>
    <hr>
    <div class="online-badge"><span class="blink">█</span> SYSTEM ONLINE</div>
  </aside>
</div>
</body>
</html>`;
}

function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
