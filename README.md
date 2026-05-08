# 📚 Reading Record Manager for Obsidian

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-v0.15.0%2B-purple?style=for-the-badge&logo=obsidian" alt="Obsidian Version" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-green?style=for-the-badge" alt="PRs Welcome" />
</p>

A seamless book status, reading notes, and final review manager for [Obsidian](https://obsidian.md). It helps you manage your reading list, track your progress, take detailed reading notes, and automatically compile a beautiful directory/dashboard of all your books in your vault.

---

### 🌐 Language / 言語
- [English (Current)](#english)
- [日本語 (Japanese)](#japanese)

---

<a name="english"></a>

## English

## ✨ Key Features

- 🎛️ **Unified Control Panel (Ribbon Integration)**
  - Consolidates all commands into **one single sidebar Ribbon icon** that launches a beautiful 2x2 grid Control Panel.
  - Instantly trigger core actions: Add Book, Edit Properties, Toggle Status, or Open the Custom Sidebar Tracker in a single place.
- 📊 **Visual Book Tracker Sidebar View**
  - Features an interactive custom right-hand sidebar panel showing beautiful stats badges for To Read, Reading, and Finished counts.
  - Displays list of "Currently Reading" books with rapid-completion toggle buttons, quick links to open books, and quick actions.
- 🖱️ **File Context Menu Actions**
  - Adds a direct right-click integration on any book file in the File Explorer. Right-click any book note to instantly toggle status or edit properties from the context menu.
- 📖 **Seamless Book Entry Creation**
  - Add new book notes with rich metadata (Title, Author, Series Name, Volume, Category, Subcategory, Status).
  - **Smart Auto-Title**: If you enter a Series Name and Volume, the plugin will automatically propose and generate the title (e.g. `My Series Vol_01`).
- 🔍 **Intelligent Suggestors (Autocomplete)**
  - Quickly input metadata using context-aware autocomplete suggestions for **Series**, **Author**, **Category**, and **Subcategory** based on your existing library.
- 🔄 **Circular Status Toggle**
  - Cycle through reading statuses (`To Read` ➡️ `Reading` ➡️ `Finished`) instantly via commands, ribbon icon, or a custom hotkey.
  - Automatically logs the **completion date** (`end_date`) as frontmatter properties when a book is marked as `Finished`.
- ✏️ **Dynamic Property Editor & Renamer**
  - Edit existing book details in an intuitive modal.
  - **Auto-Rename/Move**: If you change the Series or Volume, the plugin automatically renames and moves the `.md` file to the correct subfolder to keep your library perfectly organized.
- 📊 **Master Reading List Dashboard**
  - Automatically compiles and updates a centralized list at `Books/Master Reading List.md`.
  - Includes real-time statistics (Total Books, To Read, Reading, Finished).
  - Renders a clean Markdown table with colorful HTML badges for statuses.
- 👻 **Archiving / Hidden Finished Filter**
  - Keep your active dashboard clean. Automatically hides completed books from the directory table after a configurable number of days (e.g. 7 days), leaving only your active reads and backlog visible. Can be fully configured/toggled in Settings.
- ⚡ **Metadata Cache Watcher**
  - Updates the Master Reading List automatically in the background whenever a book's properties are updated.

---

## 📂 Vault Directory Structure

The plugin automatically organizes your book notes within a parent directory named `Books/`:

```text
vault-root/
└── Books/
    ├── Master Reading List.md           # The auto-generated dashboard
    ├── Book without Series.md           # Individual standalone books
    └── My Series Name/                  # Subfolder generated automatically for series
        ├── Vol_01.md                    # Structured volume file
        └── Vol_02.md
```

Each book file is created with standard Markdown frontmatter and template structures:

```yaml
---
title: "Book Title"
status: "Reading"
author: "Author Name"
series: "My Series Name"
volume: "01"
category: "Technology"
subcategory: "Software Engineering"
updated: 2026-05-08 21:00
---

## Reading Notes

- 

## Final Review


```

---

## ⚙️ Plugin Settings

- **Enable Hide Finished**: Toggle whether finished books should be hidden from the directory list.
- **Hide Finished Days**: Specify the threshold of days after which a finished book is hidden from the directory (default is `7` days).

---

## 🛠️ Installation

### Manual Installation
Since this plugin is not yet in the official Community Plugins list:
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. In your Obsidian vault, go to `.obsidian/plugins/` (create the folder if it doesn't exist).
3. Create a folder named `reading-record-manager`.
4. Move `main.js`, `manifest.json`, and `styles.css` into that folder.
5. Reload plugins in Obsidian and toggle on **Reading Record Manager**.

---

## 🧑‍💻 Development

If you want to compile and build the plugin locally:

### Clone & Install
```bash
git clone <your-repo-url>
cd reading-record-manager
npm install
```

### Dev Mode (Watcher)
Runs esbuild in watch mode to automatically compile files when they change:
```bash
npm run dev
```

### Production Build
Compiles TypeScript and bundles styles for release:
```bash
npm run build
```

---

<br />
<hr />
<br />

<a name="japanese"></a>

## 日本語 (Japanese)

## ✨ 主な機能

- 🎛️ **統合コントロールパネル（リボンアイコンの集約）**
  - すべての操作をサイドバーの**1つのリボンアイコン**に集約。クリックすると美しく整列された2×2グリッド形式の「コントロールパネル」が開きます。
  - 書籍追加、情報編集、ステータスの切り替え、カスタムサイドバーの起動などを1クリックで直感的に選択・起動できます。
- 📊 **ビジュアル読書トラッカー（サイドバービュー）**
  - 画面右側のサイドバーに、未読・読書中・読了本の統計数が一目でわかる美しいバッジ表示。
  - 「読書中」の書籍がリストアップされ、チェックボタンでの読了完了切り替えや、ワンクリックでの書籍ノート開封が可能です。
- 🖱️ **ファイル右クリックコンテキストメニュー統合**
  - ファイルエクスプローラー（またはエディタタイトル）上の書籍ファイルを右クリックするだけで、ステータスの切り替えや書籍プロパティの編集モーダルを瞬時に呼び出せます。
- 📖 **スムーズな書籍追加**
  - タイトル、著者、シリーズ、巻数、カテゴリ、サブカテゴリ、ステータスを入力して、書籍用のMarkdownノートを簡単に新規作成。
  - **自動タイトル生成**: シリーズ名と巻数を入力すると、タイトルを自動的に提案・生成（例: `シリーズ名 Vol_01`）。
- 🔍 **インテリジェントな入力サジェスト**
  - 既に作成した本棚のデータから、**シリーズ**、**著者**、**カテゴリ**、**サブカテゴリ**を検出してリアルタイムで補完候補を提示します。
- 🔄 **読書ステータスのワンクリックトグル**
  - ステータス（`未読 (To Read)` ➡️ `読書中 (Reading)` ➡️ `読了 (Finished)`）を、リボンアイコンやカスタムショートカットキーから瞬時に循環切り替え。
  - `読了 (Finished)` に切り替えると、自動的に完了日（`end_date`）がプロパティに自動追加されます。
- ✏️ **書籍プロパティの編集と自動リネーム・移動**
  - 作成済みの本ノートのプロパティを専用モーダルから簡単に再編集。
  - シリーズや巻数を編集すると、フォルダ構成に合わせて**自動的にファイルをリネームし、適切なシリーズフォルダへ自動移動**します。
- 📊 **読書ダッシュボード (Master Reading List)**
  - `Books/Master Reading List.md` に、すべての本を一覧できるダッシュボードを自動生成。
  - 全体の読書統計（合計数、未読数、読書中、読了数）をリアルタイムに集計。
  - 各ステータスをカラフルなHTMLバッジ付きで一覧表（Markdown Table）として整理。
- 👻 **アーカイブ機能 (読了フィルター)**
  - 読了後指定日数（デフォルトは7日）が経過した書籍を自動的に一覧から非表示にし、現在読んでいる本や未読の本に集中可能。オンオフや表示期間は設定タブから自由に変更可能。
- ⚡ **自動同期機能 (Metadata Cache Watcher)**
  - 本のノートのプロパティをエディタ上で手動変更した場合も、変更イベントを監視して自動的にダッシュボードの一覧を最新に同期します。

---

## 📂 フォルダ構成

本プラグインは、作成した書籍ファイルを自動的に `Books/` フォルダ配下へ構造化して整理します：

```text
vault-root/
└── Books/
    ├── Master Reading List.md           # 自動生成されるダッシュボード
    ├── 単行本タイトル.md                    # シリーズ設定のない個別の本
    └── シリーズ名/                       # シリーズ名に応じて自動作成されるフォルダ
        ├── Vol_01.md                    # 構造化された巻数ごとのファイル
        └── Vol_02.md
```

作成されるファイルには標準のフロントマターと、ノート用見出しがテンプレートとして組み込まれます：

```yaml
---
title: "書籍タイトル"
status: "Reading"
author: "著者名"
series: "シリーズ名"
volume: "01"
category: "技術書"
subcategory: "ソフトウェアエンジニアリング"
updated: 2026-05-08 21:00
---

## Reading Notes

- 

## Final Review


```

---

## ⚙️ 設定項目

- **Enable Hide Finished (読了本を非表示にする)**: 読了した本をダッシュボード一覧から隠すかどうかを指定します。
- **Hide Finished Days (非表示にするまでの日数)**: 本が読了になってからダッシュボード上で非表示（アーカイブ）にするまでの経過日数を指定します（デフォルト: `7` 日）。

---

## 🛠️ インストール方法

### 手動インストール
本プラグインはコミュニティプラグインの公式登録準備中のため、現在は以下の方法で手動インストール可能です：
1. 最新リリースから `main.js`, `manifest.json`, `styles.css` をダウンロードします。
2. Obsidian の保管庫（Vault）のルートにある `.obsidian/plugins/` フォルダを開きます（存在しない場合はフォルダを作成してください）。
3. `reading-record-manager` という名前のフォルダを新規作成します。
4. ダウンロードした3つのファイルをそのフォルダの中に配置します。
5. Obsidian の設定の「コミュニティプラグイン」から「プラグインの再読み込み」を押し、**Reading Record Manager** を有効化（ON）にします。

---

## 🧑‍💻 開発方法

ローカルでビルドやソースコードの修正を行う場合：

### 環境構築
```bash
git clone <リポジトリのURL>
cd reading-record-manager
npm install
```

### 開発モード (コードの監視ビルド)
コードの変更を自動で検知してコンパイルするウォッチャーを起動します：
```bash
npm run dev
```

### 本番用ビルド
TypeScriptをコンパイルし、配布用のバンドルファイルを生成します：
```bash
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
