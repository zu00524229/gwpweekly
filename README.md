# AI週報.EXE

> 每週自動彙整中文 AI 新聞，賽博龐克像素風格，部署於 Cloudflare Workers。

---

## 功能

- 每週一 08:00（台灣時間）自動抓取 AI 新聞
- 來源：機器之心、量子位、36氪、科技新報、iThome
- 自動分類：大模型 / 研究突破 / 產業動態 / 政策法規 / 工具應用
- 右側側欄可切換歷史週報
- 點擊標題開新分頁至原文
- 賽博龐克像素風格 UI

## 技術架構

```
Cloudflare Cron（每週一 00:00 UTC）
    ↓
Worker 抓取 RSS → 過濾 AI 相關 → 自動分類
    ↓
Cloudflare KV 儲存週報 JSON
    ↓
Worker 接收請求 → 從 KV 讀取 → 回傳 HTML
```

## 部署步驟

**1. 安裝依賴**
```bash
npm install
```

**2. 登入 Cloudflare**
```bash
npx wrangler login
```

**3. 建立 KV Namespace**
```bash
npx wrangler kv:namespace create GWP_WEEKLY
```
將輸出的 `id` 填入 `wrangler.toml`：
```toml
[[kv_namespaces]]
binding = "GWP_WEEKLY"
id = "貼上你的 id"
```

**4. 部署**
```bash
npx wrangler deploy
```

## 本機開發

```bash
npx wrangler dev
```

## 新聞來源

| 媒體 | 類型 |
|------|------|
| 機器之心 | AI 研究 / 產業 |
| 量子位 | AI 產業資訊 |
| 36氪 | 科技商業 |
| 科技新報 | 台灣科技媒體 |
| iThome | 台灣 IT 媒體 |

## 檔案結構

```
gwpweekly/
├── worker.js       # Cloudflare Worker 主程式
├── wrangler.toml   # Cloudflare 部署設定
├── package.json
└── .gitignore
```
