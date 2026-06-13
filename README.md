# AI週報.EXE

> 每週自動彙整中文 AI 新聞，賽博龐克像素風格，部署於 Cloudflare Pages。

---

## 功能

- 每週自動抓取 AI 新聞（透過 `/api/refresh` 觸發）
- 來源：機器之心、量子位、36氪、科技新報、iThome
- 自動分類：大模型 / 研究突破 / 產業動態 / 政策法規 / 工具應用
- 右側側欄可切換歷史週報
- 點擊標題開新分頁至原文
- 賽博龐克像素風格 UI

## 技術架構

```
外部 Cron（cron-job.org，每週一觸發）
    ↓ 呼叫 /api/refresh?secret=xxx
Pages Function 抓取 RSS → 過濾 AI 相關 → 自動分類
    ↓
Cloudflare KV 儲存週報 JSON
    ↓
Pages Function 接收請求 → 從 KV 讀取 → 回傳 HTML
```

## 部署步驟

### 1. Cloudflare Pages 連接 GitHub

Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
- 選擇此 repo
- Build command：留空
- Build output directory：`public`

### 2. 建立 KV Namespace

Cloudflare Dashboard → Workers & Pages → KV → Create namespace
- 名稱：`GWP_WEEKLY`
- 複製 Namespace ID

### 3. 綁定 KV 到 Pages

Pages 專案 → Settings → Functions → KV namespace bindings
- Variable name：`GWP_WEEKLY`
- KV namespace：選剛建立的

### 4. 設定每週自動更新

至 [cron-job.org](https://cron-job.org)（免費）建立排程任務：
- URL：`https://你的網址.pages.dev/api/refresh`
- 排程：每週一 08:00（台灣時間 = UTC 00:00）
- Cron：`0 0 * * 1`

### 5. 手動觸發第一次更新

瀏覽器開啟：
```
https://你的網址.pages.dev/api/refresh
```

## 檔案結構

```
gwpweekly/
├── functions/
│   └── [[path]].js   # Pages Function 主程式
├── public/
│   └── .gitkeep      # Cloudflare Pages 需要此目錄
├── package.json
├── .gitignore
└── README.md
```

## 新聞來源

| 媒體 | 類型 |
|------|------|
| 機器之心 | AI 研究 / 產業 |
| 量子位 | AI 產業資訊 |
| 36氪 | 科技商業 |
| 科技新報 | 台灣科技媒體 |
| iThome | 台灣 IT 媒體 |
