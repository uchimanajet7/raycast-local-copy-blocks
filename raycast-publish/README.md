# MdClip

MdClip helps you find local Markdown files in Raycast and copy their contents for reuse.

MdClip works with the Markdown folders you already manage, so you can keep editing, versioning, and organizing the files with your existing tools.

![MdClip showing a Markdown Source preview in Raycast](media/mdclip-1.png)

## What It Does

- Browse local Markdown files from up to three configured Markdown Sources.
- Find Markdown files by file name or relative path, and search across all enabled Markdown Sources from one command.
- Preview Markdown file contents before copying.
- Copy Markdown file contents.
- Copy expanded contents with supported placeholders replaced at copy time.
- Open the selected file in an editor, another app, or Finder.

MdClip does not create, edit, move, rename, or delete your Markdown files.

## Commands

| Command              | Purpose                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| Markdown Source 1    | Find Markdown files by file name or relative path in Markdown Source 1             |
| Markdown Source 2    | Find Markdown files by file name or relative path in Markdown Source 2             |
| Markdown Source 3    | Find Markdown files by file name or relative path in Markdown Source 3             |
| All Markdown Sources | Find files by file name, relative path, or Markdown Source name across all sources |

Use individual Markdown Source commands when you know which folder contains the file. Use All Markdown Sources when you want to search every enabled source at once.

Search matches file names and paths relative to their Markdown Source folders. `All Markdown Sources` also matches Markdown Source names. MdClip does not search inside Markdown file contents.

## Preferences

Configure a folder for every Markdown Source you use. MdClip needs at least one configured Markdown Source; unused sources do not need a folder.

| Preference             | When needed                      | Description                                                                                                                           |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Enable Markdown Source | Optional control                 | Allows a configured source to load files in its command and All Markdown Sources. Turn it off when you do not want to use that source |
| Markdown Source Folder | Required for each source you use | Folder containing Markdown files for that source                                                                                      |
| Markdown Source Name   | Optional                         | Display name shown in Raycast. The folder name is used when empty                                                                     |
| Editor                 | Optional                         | App used by Open in Editor                                                                                                            |
| Preview Line Count     | Optional                         | Number of leading lines shown in the preview. Range: `1`–`100`; default: `10`                                                         |
| Preview Max Characters | Optional                         | Maximum preview length. Range: `1`–`20000`; default: `4000`                                                                           |

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
