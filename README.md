# OmniShare

OmniShare is a local-first file storage and sharing workspace built with HTML, CSS, and vanilla JavaScript.

The current version replaces the original simulated upload/download prototype with a functional browser-based file engine. Files are stored as real binary data in IndexedDB and can be retrieved, downloaded, shared through supported native browser APIs, expired, searched, and deleted.


## Live Website

**Live app:** https://finalomnishare.vercel.app

## What Works

- Real file storage using IndexedDB
- Real file downloads
- Secure random OmniShare file IDs
- Drag-and-drop and file picker upload
- File expiration rules
- File lookup by ID
- Persistent local library
- Search and sorting
- Upload/download/share/delete activity log
- Browser storage usage reporting
- Clear expired files
- Native file sharing through the Web Share API when supported
- Responsive desktop/mobile interface
- Persistent dark/light theme
- Accessible keyboard-friendly controls
- No plaintext local password storage

## Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript
- IndexedDB
- Web Crypto API
- Web Share API
- Browser Storage API

## Architecture

```text
final_omnishare/
├── index.html
├── styles.css
├── app.js
├── README.md
├── portfolio/
└── portfolio-v2/
```

`index.html` contains the application structure, `styles.css` contains the responsive UI, and `app.js` manages IndexedDB persistence, file retrieval, expiration, downloads, activity, storage statistics, and browser-native sharing.

## Local-first Model

OmniShare currently works as a fully functional local-first application.

The actual files are stored in the browser profile where they were uploaded. This means:

- files persist after page refreshes;
- generated IDs retrieve actual file data from the same browser profile;
- expiration and delete actions affect the stored file itself;
- no cloud server receives the file.

Because there is no cloud object storage or database connected yet, an OmniShare ID alone does **not** retrieve a file from another device or browser. Where supported, the **Share file** action sends the actual file using the device's native Web Share interface.

A future cloud mode can add cross-device IDs, authentication, and remote storage without replacing the current local-first engine.

## Running Locally

Serve the repository with any static web server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Opening the page through a local HTTP server is preferred over directly opening the HTML file because browser storage and sharing APIs behave more consistently on an HTTP origin.

## Browser Requirements

A modern browser with IndexedDB support is required. Native file sharing depends on Web Share API support.

The current maximum single-file upload size is 100 MB. Actual available capacity depends on the storage quota assigned by the browser.

## Security Notes

- File IDs are generated with `crypto.getRandomValues()`.
- OmniShare no longer stores fake user passwords in `localStorage`.
- User-provided file names and notes are rendered through DOM text nodes rather than injected as HTML.
- Files remain local unless the user explicitly shares or exports them through browser functionality.

## Portfolio

The developer portfolio copy remains under:

```text
portfolio-v2/index.html
```

## Developer

**Jim Rodmark Camus**  
BSIT — Network Technology  
GitHub: [@Sachibara](https://github.com/Sachibara)

## Related Project

See [Pyrewall](https://github.com/Sachibara/Pyrewall), a Python/PyQt6 Windows firewall and network-monitoring project.
