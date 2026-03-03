# Video Subtitle Generator

為網頁影片即時產生雙語字幕（原文 + 繁體中文）的 Chrome 擴充功能。

## 功能

- 自動偵測頁面上的影片元素
- 透過 Web Speech API 即時語音辨識
- 自動翻譯為繁體中文（Chrome 內建 Translator API / Google Translate）
- 雙語字幕覆蓋顯示（繁中 + 原文）
- 支援多種來源語言（英/日/韓/法/德/西）
- 可調整字幕大小、顯示/隱藏原文或翻譯

## 安裝

1. 下載或 clone 此專案
2. 開啟 Chrome，前往 `chrome://extensions/`
3. 右上角開啟「開發人員模式」
4. 點選「載入未封裝項目」
5. 選擇此專案資料夾

## 使用方式

1. 開啟任何含有影片的網頁（如 YouTube）
2. 點擊工具列上的擴充功能圖示
3. 點選「開始產生字幕」
4. 允許麥克風權限
5. 影片下方會出現即時雙語字幕

### 設定選項

| 選項 | 說明 |
|------|------|
| 來源語言 | 影片的語音語言（預設英文） |
| 字幕大小 | 12px ~ 32px 可調 |
| 顯示原文 | 是否顯示原文字幕 |
| 顯示繁中翻譯 | 是否顯示翻譯字幕 |

## 運作原理

```
麥克風收音 → Web Speech API 語音辨識 → 翻譯 → 字幕覆蓋顯示
```

1. **影片偵測** — 自動找到頁面上最大的 `<video>` 元素
2. **語音辨識** — 使用瀏覽器內建 Web Speech API，透過麥克風即時辨識
3. **翻譯** — 優先使用 Chrome 內建 Translator API，不支援時 fallback 到 Google Translate
4. **字幕顯示** — 繁中（金色）+ 原文（白色）雙語覆蓋在影片底部

## 專案結構

```
video-subtitle-extension/
├── manifest.json                 # Chrome Extension Manifest V3
├── popup/
│   ├── popup.html                # 設定面板
│   └── popup.js                  # 開關與設定邏輯
├── content/
│   ├── content.js                # 核心：影片偵測、語音辨識、翻譯、字幕
│   └── styles.css                # 字幕 overlay 樣式
├── background/
│   └── service-worker.js         # 狀態管理、tab 生命週期清理
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 已知限制

- **麥克風收音**：Web Speech API 僅支援麥克風輸入，影片聲音需從喇叭播出讓麥克風收到。使用耳機時效果會較差。
- **翻譯品質**：使用免費翻譯服務，品質中等。
- **跨域限制**：部分網站的 iframe 內嵌影片可能無法偵測。
- **需要網路**：語音辨識和翻譯皆需網路連線。

## 最佳使用建議

1. 使用外接喇叭播放影片（讓麥克風能收到聲音）
2. 減少環境噪音以提高辨識準確度
3. 選擇正確的來源語言

## 技術細節

- Chrome Extension Manifest V3
- Web Speech API (`SpeechRecognition`)
- Chrome Built-in Translator API（`self.ai.translator`）
- Google Translate 免費端點（fallback）
- 純 JavaScript，無需建置工具

## License

MIT
