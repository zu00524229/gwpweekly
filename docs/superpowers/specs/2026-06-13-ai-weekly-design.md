# AI週報.EXE — 設計規格

## 概述

每週自動彙整中文 AI 新聞的靜態網站，部署於 Cloudflare Workers，賽博龐克像素風格。

## 功能需求

- 每週一 08:00（UTC+8）自動從 RSS 抓取 AI 新聞
- 依分類標記文章（大模型 / 產業動態 / 研究突破 / 政策法規 / 工具應用）
- 顯示標題、摘要、來源、日期
- 點擊標題開新分頁至原文
- 右側側欄列出歷史週報，可切換不同週次
- 頂部跑馬燈顯示本週最新標題

## 新聞來源（RSS）

| 媒體 | RSS URL |
|------|---------|
| 機器之心 | https://jiqizhixin.com/rss |
| 量子位 | https://qbitai.com/feed |
| 36氪 AI | https://36kr.com/feed |
| 科技新報 | https://technews.tw/feed |
| iThome | https://www.ithome.com.tw/rss |

## 技術架構

```
Cloudflare Cron Trigger（每週一 00:00 UTC）
    ↓
fetch-worker.js — 抓取各 RSS、過濾 AI 相關、自動分類
    ↓
Cloudflare KV — 儲存週報 JSON（key: "week-YYYY-WW"，index: "weeks-index"）
    ↓
serve-worker.js — 接收 HTTP 請求，從 KV 讀資料，回傳 HTML
```

## 資料結構

```json
// KV key: "week-2026-24"
{
  "week": 24,
  "year": 2026,
  "dateRange": "2026.06.09 – 06.13",
  "articles": [
    {
      "id": 1,
      "category": "大模型",
      "title": "...",
      "summary": "...",
      "source": "機器之心",
      "date": "2026-06-10",
      "url": "https://..."
    }
  ]
}

// KV key: "weeks-index"
["week-2026-24", "week-2026-23", ...]
```

## 分類規則

RSS 文章標題/描述含以下關鍵字自動分類：
- **大模型**：GPT、Claude、Gemini、LLM、大模型、語言模型
- **產業動態**：融資、收購、裁員、發布、上市、晶片
- **研究突破**：論文、arXiv、實驗室、研究、突破、架構
- **政策法規**：法規、監管、政策、禁令、合規、EU AI
- **工具應用**：發布、更新、插件、API、應用、助理

過濾條件：標題或描述含「AI」「人工智慧」「機器學習」「深度學習」「大模型」「LLM」其一。

## 檔案結構

```
gwpweekly/
├── worker.js          # 主 Worker（serve + cron fetch）
├── wrangler.toml      # Cloudflare 設定
├── package.json
└── .gitignore
```

## 部署

- Platform：Cloudflare Workers
- KV Namespace：`GWP_WEEKLY`
- Cron：`0 0 * * 1`（每週一 00:00 UTC = 台灣時間 08:00）
- GitHub repo：https://github.com/zu00524229/gwpweekly.git
