# MdClip メンテナー向けリリース管理

## 1. 目的

この文書は、MdClip の release owner / maintainer が GitHub Release 作成、release manifest、release body、検証、workflow 実行順を管理するための手順を定義します。

| 項目             | 位置づけ                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Audience         | MdClip の release owner / maintainer                                                                                    |
| Scope            | GitHub Release 作成、release manifest、release body、検証、workflow 実行順、Store publication prerequisites             |
| Active user path | 利用者向けの導入、通常更新、クリーン再インストール、削除は [MdClip を使い始める](getting-started.ja.md) を正とする      |
| Store path       | Store publish の必要 resource と開始条件は [Store publication prerequisites](#8-store-publication-prerequisites) で扱う |

MdClip の active release path は GitHub Release です。release owner / maintainer は、latest release tag に紐づく source archive が利用者向け取得導線になることを前提に release を管理します。

## 2. Release owner 管理対象

| 対象                             | 役割                                                   | release 管理での扱い                                                                                           |
| -------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| GitHub Release                   | latest release tag と source archive の公開単位        | Active public release unit                                                                                     |
| `Release` workflow               | Git tag と GitHub Release を作成する                   | `.github/release-manifest.json` に従って手動実行する                                                           |
| `Build` workflow                 | build、local verification、Raycast CLI lint を確認する | `main` branch への push、`main` branch を target とする Pull Request、手動実行、または他 workflow から実行する |
| `.github/release-manifest.json`  | リリース準備コミットが表す GitHub Release の記述子     | リリース準備時に更新し、`Release` workflow の入力として管理する                                                |
| `.github/release-changelog/*.md` | GitHub Release body の source                          | release tag と同じ version 名で作成または更新する                                                              |
| `docs/screenshot-media.md`       | 共通 screenshot / UI evidence 手順                     | README、GitHub、Release、Store で共有する画像の作成と確認に使う                                                |
| `docs/local-verification.md`     | 開発・メンテナンス検証手順                             | release 前の local verification と手動確認の範囲を定義する                                                     |

## 3. 公式情報の位置づけ

- GitHub Releases は tag に基づき、release notes と source archive を公開できる repository-native release unit です。
  - https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- GitHub source archives は release / tag に紐づく source code の取得経路です。
  - https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives
- GitHub Actions の continuous integration は build と test を workflow で確認する仕組みです。
  - https://docs.github.com/en/actions/get-started/continuous-integration
- Raycast CLI は extension の develop、build、lint を扱います。
  - https://developers.raycast.com/information/developer-tools/cli

## 4. Release manifest

`.github/release-manifest.json` は、リリース準備コミットが表す GitHub Release の記述子です。次のリリースタグと changelog が確定したリリース準備時だけ更新し、公開後は次のリリース準備まで公開済み Release の値を保持します。未確定の次期バージョンを公開直後に仮設定しません。

`v0.4.0` のリリース準備では、公開済みの `v0.3.0` を直前の GitHub Release として扱います。`v0.2.0` 以前は、Local Copy Blocks 時代を含むそれ以前のリリース履歴です。

形式は以下とします。

```json
{
  "tag": "vX.Y.Z",
  "title": "vX.Y.Z",
  "previousGitHubReleaseTag": "vX.Y.Z",
  "githubReleaseChangelogFile": ".github/release-changelog/vX.Y.Z.md"
}
```

| 項目                         | 意味                                                     |
| ---------------------------- | -------------------------------------------------------- |
| `tag`                        | 記述対象の GitHub Release tag                            |
| `title`                      | 記述対象の GitHub Release title                          |
| `previousGitHubReleaseTag`   | 記述対象の直前に作成済みの GitHub Release tag            |
| `githubReleaseChangelogFile` | 記述対象の GitHub Release body として使う changelog file |

Store publish state は GitHub Release 作成 manifest には含めません。Store publish の管理対象は [Store publication prerequisites](#8-store-publication-prerequisites) で扱います。

現在の manifest は、`v0.3.0` を直前の GitHub Release として `v0.4.0` を作成するリリース準備を指します。

```json
{
  "tag": "v0.4.0",
  "title": "v0.4.0",
  "previousGitHubReleaseTag": "v0.3.0",
  "githubReleaseChangelogFile": ".github/release-changelog/v0.4.0.md"
}
```

## 5. GitHub Release 用 changelog

`.github/release-changelog/vX.Y.Z.md` は、GitHub Release body として使う changelog file です。

1 つの GitHub Release tag に対して 1 file 作成します。file name の `vX.Y.Z` は、対応する GitHub Release tag と一致させます。

将来作成する release body は、次の固定書式を使います。

```markdown
## What changes for you

- <この Release で利用者が見える・できることの変化と、その意味>

## Install or update

- <この Release を取得・更新・移行して使うために利用者が行うこと>
```

書式には次の規則を適用します。

- `## What changes for you`、`## Install or update` の 2 見出しだけを、この順番で使う。
- 前置き、body 内の version 見出し、空 section、追加見出しを置かない。
- 各 section に `- ` で始まる空ではない list item を 1 つ以上置く。
- `What changes for you` には、利用者が見える・できることの変化、利用条件、安全性、互換性、または制限の意味を書く。
- `Install or update` には、その Release を取得、install、update、移行、または安全に利用するために利用者が行うことを書く。
- 利用者の理解、判断、操作を変えない CI、検証、workflow、公開経路の内部状態、保守用 file、将来検討は掲載せず、この文書などの maintainer 向け surface で管理する。

`scripts/release-manifest.mjs validate` と同 script の `body` / `outputs` 経路は、future release body の見出し、順序、前置き、list、Correction 表記を検証します。`npm run check:release` はこの契約の正常系、拒否系、legacy 境界、回復を Node.js 標準 test で確認し、`npm run lint` の一部として実行します。意味上の掲載可否は keyword や classifier では判定せず、release owner / maintainer が上記の 2 つの利用者タスクに照らして判断します。

次の 6 file だけを、固定書式導入前に公開済みの closed legacy set とします。

- `.github/release-changelog/v0.1.0.md`
- `.github/release-changelog/v0.1.1.md`
- `.github/release-changelog/v0.1.2.md`
- `.github/release-changelog/v0.1.3.md`
- `.github/release-changelog/v0.1.4.md`
- `.github/release-changelog/v0.2.0.md`

この set に新しい path を追加しません。上記以外の release body file は version 番号にかかわらず固定書式を通します。既存 tag の release body file と公開済み GitHub Release は、固定書式へ合わせるだけの一括編集を行わず、履歴として残します。

公開済み body に、誤った install、update、移行、安全、互換性、または利用判断を招く重大な虚偽、誤解、欠落が見つかった場合だけ訂正します。

- future 固定書式では、該当 section の先頭へ `- **Correction (YYYY-MM-DD):** <訂正内容>` を追加する。
- legacy body では、既存の version 見出しまたは前置きの後にある body list の先頭へ同じ表記を追加する。
- Correction item は通常 item より前に置き、実在する日付を `YYYY-MM-DD` で記録する。
- current branch の release body file と公開済み GitHub Release notes を同じ内容へ更新し、tag は移動しない。
- GitHub Release notes を外部更新する前に、訂正内容、対象 Release、current branch の release body file との一致を確認する。

## 6. Release 作成手順

GitHub Release を作成する場合は、次を行います。

導入、通常更新、クリーン再インストール、削除、完了確認に関する利用者向け手順を変更した場合は、英語の `docs/getting-started.md` と日本語の `docs/getting-started.ja.md` を同じ変更単位で確認します。見出し文言や段落数の一致ではなく、両言語で同じ利用者taskを完了できること、日本語の一般説明が自然であること、UIラベル、コマンド、パス、ファイル名、製品名、コード識別子が実際の画面やターミナルと照合できる表記であることをmanual reviewします。`npm run check:docs` は文書pair、相互言語link、canonical path、登録済み参照を検査しますが、翻訳内容の意味や日本語の自然さは判定しません。

1. 最後に作成済みの GitHub Release tag を確認する。
2. 今回作成する GitHub Release tag を決める。
3. [GitHub Release 用 changelog](#5-github-release-用-changelog) の固定書式で `.github/release-changelog/vX.Y.Z.md` を作成または更新する。
4. `.github/release-manifest.json` の `tag`、`title`、`previousGitHubReleaseTag`、`githubReleaseChangelogFile` を、今回の Release と直前の公開済み Release に合わせて更新する。
5. 利用者向け導入、通常更新、クリーン再インストール、削除手順を変更した場合は、英語版と日本語版のtask coverage、日本語の一般説明、実際のUIラベルやコマンドとの一致をmanual reviewする。
6. `npm run lint` を実行する。
7. 必要に応じて `npm run lint:raycast` を実行する。
8. 必要に応じて `npm run build` を実行する。
9. README や GitHub Release で current UI evidence を扱う場合は、共通の `docs/screenshot-media.md` に従って画像を作成し、manual visual checks を完了する。
10. 変更を commit / push する。
11. GitHub Actions の `Release` workflow を手動実行する。

`Release` workflow は、push 済みの `.github/release-manifest.json` を読み、manifest の `tag` で Git tag と GitHub Release を作成します。

GitHub Release body は、manifest の `githubReleaseChangelogFile` から作成します。

GitHub Release が正常に公開された後は、manifest を未確定の次期バージョンへ進めません。次のリリース内容とバージョンが確定するまで、公開済み Release の値を保持します。

同じ manifest を使って `Release` workflow を新しく開始すると、`prepare-tag` は既存タグを検出して停止します。これは同じ Release の重複作成を防ぐ正常な動作であり、失敗した Release の再開方法ではありません。

`prepare-tag` がタグを作成した後に `github-release` だけが失敗した場合は、新しい workflow run や `Re-run all jobs` を開始せず、同じ workflow run で `Re-run failed jobs` を実行します。GitHub Actions の re-run は元の run と同じ `GITHUB_SHA` と `GITHUB_REF` を使うため、成功済みのタグ作成を繰り返さずに失敗した Release 作成を再実行できます。[GitHub Actions で workflow と job を再実行する](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

## 7. Workflows

### 7.1 Build

`Build` workflow は、source、build、local verification、Raycast CLI lint を確認します。

現在の `Build` workflow は次を実行します。

1. `.node-version` の Node.js をsetupする。
2. `npm run check:dependencies`
3. `npm ci`
4. `npm run build`
5. `npm run lint`
6. `npm run lint:raycast`

すべてのexternal actionはfull commit SHAへ固定し、DependabotのGitHub Actions updateで新しいreleaseを検知します。`setup-node`のnpm cacheは無効化し、`.node-version`のNode.jsに同梱されるnpmでproject commandを実行します。このreleaseではNode.js 24.19.0 Active LTSと同梱npm 11.17.0をBuild、Release、Store publicationの共通検証構成にします。

### 7.2 Release

`Release` workflow は、GitHub tag と GitHub Release を作成する workflow です。

`Release` workflow は Raycast Store publish を呼び出しません。`publish_to_raycast` input も持ちません。

dependency installと検証はreusable `Build` jobだけが担当します。`prepare-tag`と`github-release`はNode.js standard libraryだけを使うrelease manifest処理なので、`npm ci`を重複実行しません。

### 7.3 Store publication workflow

`.github/workflows/publish-release-to-raycast.yml` と `scripts/publish-raycast-pr.mjs` は、Store publication path に属します。

Repository variable `MDCLIP_RAYCAST_STORE_PUBLISH_REAPPROVED` が `true` の場合だけ、Store publish path として扱います。

publish jobは、default branchではなく指定された`release-source/.node-version`のNode.jsをsetupします。publish script内部の`npm ci`と`npx --yes @raycast/api@latest publish`は、そのNode.jsに同梱されるnpmと実行環境のnpm registry設定で実行します。

Store publish を開始すると、script はrelease sourceでGitに追跡されたfilesだけをcopy候補にし、`raycast-publish/README.md` と `raycast-publish/CHANGELOG.md` を publish source の root `README.md` / `CHANGELOG.md` として使います。source-use root の `README.md`、`README.ja.md`、`docs/`、root `CHANGELOG.md`、`.github/`、`raycast-publish/` は publish source から除外します。

開いている Raycast Pull Request がない場合、script は prepared publish source 上で Raycast の公式 publish command を実行します。開いている Pull Request がある場合は、prepared publish source を `raycast/extensions` fork branch に配置して既存 Pull Request を更新します。

外部 GitHub state を変える前に、[Store publication prerequisites](#8-store-publication-prerequisites) がすべて完了していることと、対象とする外部 state を確認します。

### 7.4 Dependency and toolchain maintenance

dependencyは、Release workflowから独立したlocal maintenance operationとして `npm run update:dependencies` で更新・検証します。通常実行はdeclared range内を更新し、range外majorと `npm run update:dependencies -- --allow-major` を表示します。明示許可実行は全direct major候補を同じnpm resolver graphでlatestへ進め、`@types/node`を採用する`@raycast/api`のexact type contractへ同期し、TypeScript 7以降はlatest CLIとTypeScript 6 tooling APIの公式side-by-side contractを構成して完全検証します。型契約管理対象はselected versionとregistry latestを更新結果のように混在させず、未解決のdependency判断とは別に表示します。Node.jsの選定、install、切り替え、`.node-version`の更新、Git操作、Pull Request、Issue、Release、Raycast Store publicationは行いません。

Release workflowは引き続きRelease sourceに記録された `.node-version` を使用し、release時にlatest Node.jsへ自動追従しません。Node.js selectionはdependency maintenanceと分離し、サポート中のLTS lineであること、同梱npmが`engines.npm`を満たすこと、Build、Release、Store publicationの全経路が成立することを同じ変更単位で確認します。どちらの採用判断も変更内容と検証結果をmaintainerが確認した後に行います。

## 8. Store publication prerequisites

Raycast Store publish を開始する前に、Store-facing resource と GitHub/Raycast 外部 state を一つの publication path として確認します。

Raycast Store publish に関係する公式情報は次です。

- Raycast の public extension publish は `npm run publish` から `raycast/extensions` repository への Pull Request 作成または更新に接続されます。
  - https://developers.raycast.com/basics/publish-an-extension
- Raycast Store の準備では、README、metadata screenshots、Version History 用 changelog などの Store-facing resource が必要です。
  - https://developers.raycast.com/basics/prepare-an-extension-for-store

確認対象は少なくとも次です。

- product direction と distribution model
- Store 公開用 publish source
- `.github/workflows/publish-release-to-raycast.yml`
- `scripts/publish-raycast-pr.mjs`
- `raycast-publish/publish.md`
- `raycast-publish/README.md`
- `raycast-publish/CHANGELOG.md`
- 共通 screenshot / UI evidence 手順である `docs/screenshot-media.md`
- Store 固有の追加確認だけを扱う `raycast-publish/screenshots.md`
- `RAYCAST_PUBLISH_GITHUB_TOKEN_CLASSIC`
- README / docs / GitHub About metadata

Store publish source では `raycast-publish/README.md` と `raycast-publish/CHANGELOG.md` を root 相当として使います。source-use root に root `CHANGELOG.md` を復帰する場合は、root surface の意味と README / GitHub Release / Store Version History の整合性を別途判断します。

GitHub Actions UI の workflow disable、repository secret の削除、GitHub Release publishing、Raycast Store publish、`raycast/extensions` Pull Request 作成または更新では、各操作の直前に対象と変更内容を確認して実行します。
