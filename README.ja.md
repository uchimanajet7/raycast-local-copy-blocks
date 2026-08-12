# MdClip

[English](README.md) | 日本語

MdClip は、ローカルの Markdown ファイルを Raycast から探し、ファイル本文をコピーするための個人利用向けのローカル Raycast 拡張機能です。

再利用したい本文を Markdown ファイルとして管理し、Raycast から検索、プレビュー、コピーしたいときに使います。まずは下の「使い始める」から、ローカルで起動する手順に進んでください。

![Raycast で Markdown Source のプレビューを表示している MdClip](media/mdclip-1.png)

## 何ができるか

MdClip は、再利用する本文を普段使っている Markdown ファイルで管理できます。

- 再利用したい本文を通常の `.md` ファイルとして管理する
- それらのファイルを最大 3 つの Markdown Source に分ける
- Raycast から Markdown Source コマンドを開き、ファイル名または相対パスでファイルを探し、プレビューしてコピーする
- ファイル本文をコピーするか、対応するプレースホルダーを展開した内容をコピーする

MdClip は Markdown ファイルを新規作成、編集、移動、名前変更、削除しません。

## 使い始める

MdClip は、Raycast Store ではなく、GitHub Release のソースコードから導入するローカル Raycast 拡張機能です。導入には macOS、Raycast、ターミナル、および取得したリリースが対応する Node.js と npm が必要です。更新時は新しいリリースを取得して手順を再実行します。

通常利用では、[最新の GitHub Release](https://github.com/uchimanajet7/mdclip/releases/latest) から `Source code (zip)` を取得します。取得するソースアーカイブは、最新のリリースタグに紐づくソースです。

展開した `mdclip` フォルダで、[使い始める手順](docs/getting-started.ja.md)に従ってそのリリースの Node.js と npm の条件を確認してから、次を実行します。

```bash
npm ci
npm run dev
```

`npm run dev` が起動したら、Raycast の拡張機能設定で少なくとも 1 つの Markdown Source にフォルダを設定します。

正確な動作条件と、導入、更新、クリーン再インストール、削除の全手順は [使い始める手順](docs/getting-started.ja.md) を参照してください。

## コマンド

| コマンド             | 用途                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| Markdown Source 1    | Markdown Source 1 からファイル名または相対パスで Markdown ファイルを探す           |
| Markdown Source 2    | Markdown Source 2 からファイル名または相対パスで Markdown ファイルを探す           |
| Markdown Source 3    | Markdown Source 3 からファイル名または相対パスで Markdown ファイルを探す           |
| All Markdown Sources | すべての Source からファイル名、相対パス、Markdown Source の表示名でファイルを探す |

対象フォルダが決まっている場合は個別の Markdown Source コマンドを使い、場所が曖昧な場合は All Markdown Sources を使います。

検索対象は、ファイル名と Markdown Source フォルダからの相対パスです。`All Markdown Sources` では、Markdown Source の表示名も検索できます。Markdown ファイルの本文は検索しません。

Raycast Root Search のコマンド順は利用状況に応じて変わります。順序が意図どおりでない場合は、対象コマンドを選択し、`⌘ K` で Action Panel を開いて `Reset Ranking` を実行してください。詳しくは [Raycast Search Bar manual](https://manual.raycast.com/search-bar) を参照してください。

## 設定

使用する Markdown Source ごとにフォルダを設定してください。MdClip を利用するには、少なくとも 1 つの Markdown Source にフォルダが必要です。使わない Markdown Source にはフォルダを設定する必要はありません。

3 つの Markdown Source にはそれぞれ有効／無効、フォルダ、表示名の設定があり、Editor とプレビュー設定は共通です。

| 設定項目               | 必要になる条件                      | 説明                                                                                                                                             |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enable Markdown Source | 任意の切り替え                      | フォルダ設定済みの Markdown Source を個別コマンドと All Markdown Sources の対象に含める。使用しない場合はオフにする                              |
| Markdown Source Folder | 使用する Markdown Source ごとに必須 | その Markdown Source が読み取る Markdown ファイルのフォルダ                                                                                      |
| Markdown Source Name   | 任意                                | MdClip 内の一覧、セクション、メタデータで使う Markdown Source の表示名。Raycast Root Search のコマンド名は変わらない。空の場合はフォルダ名を使う |
| Editor                 | 任意                                | Open in Editor で使うエディタ                                                                                                                    |
| Preview Line Count     | 任意                                | プレビューに表示する冒頭行数。範囲は `1`～`100`、初期値は `10`                                                                                   |
| Preview Max Characters | 任意                                | プレビューの最大長。範囲は `1`～`20000`、初期値は `4000`                                                                                         |

## アクション

Markdown ファイルを選択した状態で、次のアクションを使えます。

| アクション            | 説明                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| Copy Raw Content      | Markdown ファイルの本文をコピー                                      |
| Copy Expanded Content | 対応するプレースホルダーを置換してから Markdown ファイル本文をコピー |
| Show/Hide Preview     | プレビューペインの表示を切り替える                                   |
| Open in Editor        | 設定済みのエディタで選択中ファイルを開く                             |
| Open                  | エディタ未設定時に既定アプリで選択中ファイルを開く                   |
| Open with...          | 任意の対応アプリで選択中ファイルを開く                               |
| Show in Finder        | Finder で選択中ファイルを表示                                        |

既定のアクションは `Copy Raw Content` です。

## Dynamic Placeholders

`Copy Expanded Content` は、次の表に大文字・小文字まで完全一致するプレースホルダーだけを置換します。それ以外のテキストはそのままコピーし、元の Markdown ファイルは変更しません。

| プレースホルダー | 置換内容                                          |
| ---------------- | ------------------------------------------------- |
| `{date}`         | 実行環境のロケールに基づく現在日付                |
| `{time}`         | 実行環境のロケールに基づく現在時刻                |
| `{datetime}`     | 実行環境のロケールに基づく現在日時                |
| `{day}`          | 実行環境のロケールに基づく曜日                    |
| `{timezone}`     | `Asia/Tokyo UTC+09:00` のような現在のタイムゾーン |
| `{now}`          | 現在日時とタイムゾーン                            |
| `{uuid}`         | 出現箇所ごとに個別生成する UUID                   |
| `{clipboard}`    | 現在のクリップボードのテキスト                    |

## Markdown ファイルの扱い

MdClip は、拡張子 `.md` のファイルを大文字小文字を区別せずに再帰的に読み取ります。

Markdown 本文は UTF-8 として有効である必要があります。UTF-8 として不正なファイルではプレビューまたはコピーを停止し、UTF-8 で保存するよう案内します。

次のパスは一覧対象から除外します。

- `.git`
- `node_modules`
- 隠しディレクトリ
- 拡張子が `.md` ではないファイル

シンボリックリンクは辿りません。

## データの扱い

MdClip は、利用者が有効化した Markdown Source に設定したフォルダ内の Markdown ファイルだけを読み取ります。

Markdown 本文は、利用者がコピーアクションを実行した場合だけクリップボードに渡します。現在のクリップボードのテキストは、`Copy Expanded Content` が `{clipboard}` を含む Markdown ファイルを処理する場合だけ読み取ります。

通常利用中に MdClip 自体がネットワークリクエストを行うことはありません。

## ヘルプ

導入、更新、クリーン再インストール、削除については [使い始める手順](docs/getting-started.ja.md) を参照してください。

通常の MdClip の問題は [GitHub Issues](https://github.com/uchimanajet7/mdclip/issues) で報告してください。再現手順、実際の結果、期待する結果、MdClip、Raycast、macOS のバージョンを記載してください。非公開の Markdown 本文、クリップボードの内容、その他の機密情報は記載しないでください。

セキュリティ連絡先は MdClip メンテナーの [@uchimanajet7](https://github.com/uchimanajet7) です。脆弱性の可能性がある問題を報告する場合は、詳細を公開せず、非公開での連絡を希望する旨だけを GitHub Issue で知らせてください。メンテナーが非公開の連絡方法を案内します。

## 開発とメンテナンス

- [開発・メンテナンス検証](docs/local-verification.md)
- [メンテナー向けリリース管理](docs/release-management.md)
