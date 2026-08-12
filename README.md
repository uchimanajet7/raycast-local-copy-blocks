# MdClip

English | [日本語](README.ja.md)

MdClip is a personal/local Raycast extension for finding local Markdown files and copying their contents from Raycast.

Use MdClip when you keep reusable text in Markdown files and want to search, preview, and copy those files from Raycast without changing the originals. Start with the Get Started section below to run the extension locally.

![MdClip showing a Markdown Source preview in Raycast](media/mdclip-1.png)

## What It Does

MdClip works with the Markdown files you already manage.

- You keep reusable text in normal `.md` files.
- You group those files into up to three Markdown Sources.
- You open a Markdown Source command in Raycast, find a file by its name or relative path, preview it, and copy its contents.
- You can copy Markdown file contents or expand supported placeholders while copying.

MdClip does not create, edit, move, rename, or delete your Markdown files.

## Get Started

MdClip is installed from GitHub Release source code as a local Raycast extension, not from the Raycast Store. Setup requires macOS, Raycast, Terminal, and versions of Node.js and npm supported by the downloaded release. Updates are applied manually from a newer release.

For normal use, download `Source code (zip)` from the [latest GitHub Release](https://github.com/uchimanajet7/mdclip/releases/latest). The downloaded source archive is tied to the latest release tag.

In the extracted `mdclip` folder, confirm the release's Node.js and npm requirements in [Getting Started](docs/getting-started.md), then run:

```bash
npm ci
npm run dev
```

After `npm run dev` starts, open Raycast and configure at least one Markdown Source folder in the extension preferences.

See [Getting Started](docs/getting-started.md) for the exact requirements and complete setup, update, clean reinstallation, and removal steps.

## Commands

| Command              | Purpose                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| Markdown Source 1    | Find Markdown files by file name or relative path in Markdown Source 1             |
| Markdown Source 2    | Find Markdown files by file name or relative path in Markdown Source 2             |
| Markdown Source 3    | Find Markdown files by file name or relative path in Markdown Source 3             |
| All Markdown Sources | Find files by file name, relative path, or Markdown Source name across all sources |

Use individual Markdown Source commands when you know which folder contains the file. Use All Markdown Sources when you want to search every enabled source at once.

Search matches file names and paths relative to their Markdown Source folders. `All Markdown Sources` also matches Markdown Source names. MdClip does not search inside Markdown file contents.

Raycast Root Search learns from your usage, so command order can change. If the order feels wrong, select the command, open the Action Panel with `⌘ K`, and run `Reset Ranking`. See the [Raycast Search Bar manual](https://manual.raycast.com/search-bar).

## Preferences

Configure a folder for every Markdown Source you use. MdClip needs at least one configured Markdown Source; unused sources do not need a folder.

Each of the three Markdown Sources has an enable switch, folder, and display name. Editor and preview settings are shared.

| Preference             | When needed                      | Description                                                                                                                                                  |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enable Markdown Source | Optional control                 | Allows a configured source to load files in its command and All Markdown Sources. Turn it off when you do not want to use that source                        |
| Markdown Source Folder | Required for each source you use | Folder containing Markdown files for that source                                                                                                             |
| Markdown Source Name   | Optional                         | Source display name used inside MdClip lists, sections, and metadata. It does not rename the Raycast Root Search command. The folder name is used when empty |
| Editor                 | Optional                         | App used by Open in Editor                                                                                                                                   |
| Preview Line Count     | Optional                         | Number of leading lines shown in the preview. Range: `1`–`100`; default: `10`                                                                                |
| Preview Max Characters | Optional                         | Maximum preview length. Range: `1`–`20000`; default: `4000`                                                                                                  |

## Actions

| Action                | Description                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| Copy Raw Content      | Copies the Markdown file contents                                                 |
| Copy Expanded Content | Replaces supported placeholders in the full Markdown file content, then copies it |
| Show/Hide Preview     | Toggles the preview pane                                                          |
| Open in Editor        | Opens the selected file in the configured editor                                  |
| Open                  | Opens the selected file in the default app when no editor is configured           |
| Open with...          | Opens the selected file with another compatible app                               |
| Show in Finder        | Shows the selected file in Finder                                                 |

`Copy Raw Content` is the default action.

## Dynamic Placeholders

`Copy Expanded Content` replaces only the exact, case-sensitive placeholders listed below. All other text is copied unchanged. The original Markdown file is not modified.

| Placeholder   | Replacement                                                |
| ------------- | ---------------------------------------------------------- |
| `{date}`      | Current date based on your environment locale              |
| `{time}`      | Current time based on your environment locale              |
| `{datetime}`  | Current date and time based on your environment locale     |
| `{day}`       | Day of the week based on your environment locale           |
| `{timezone}`  | Current time zone in a form such as `Asia/Tokyo UTC+09:00` |
| `{now}`       | Current date and time plus time zone                       |
| `{uuid}`      | Random UUID generated separately for each occurrence       |
| `{clipboard}` | Current clipboard text                                     |

## Markdown File Handling

MdClip recursively reads files with a `.md` extension, matched case-insensitively.

Markdown contents must be valid UTF-8. If a file is not valid UTF-8, MdClip stops preview or copy and asks you to save the file as UTF-8.

The following paths are excluded:

- `.git`
- `node_modules`
- hidden directories
- files whose extension is not `.md`

Symbolic links are not followed.

## Data Handling

MdClip reads Markdown files only from folders you configure as enabled Markdown Sources.

Markdown contents are sent to the clipboard only when you run a copy action. The current clipboard text is read only when `Copy Expanded Content` processes a Markdown file containing `{clipboard}`.

MdClip does not make network requests during normal extension use.

## Help

For setup, update, clean reinstallation, and removal instructions, see [Getting Started](docs/getting-started.md).

Report ordinary MdClip problems through [GitHub Issues](https://github.com/uchimanajet7/mdclip/issues). Include the reproduction steps, the actual and expected results, and the MdClip, Raycast, and macOS versions. Do not include private Markdown content, clipboard content, or other sensitive data.

Security contact: MdClip maintainer [@uchimanajet7](https://github.com/uchimanajet7). If a report may involve a security vulnerability, do not post the vulnerability details publicly. Open a GitHub Issue containing only a request for private contact; the maintainer will provide a private contact method.

## Development And Maintenance

- [Development and maintenance verification](docs/local-verification.md)
- [Maintainer release management](docs/release-management.md)
