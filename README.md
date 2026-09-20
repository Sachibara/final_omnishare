# OmniShare

OmniShare is a responsive browser-based file-sharing interface prototype built with HTML, CSS, and vanilla JavaScript.

It demonstrates a complete front-end workflow for selecting files, simulating uploads, generating shareable file IDs, configuring expiration periods, looking up downloads, managing local account state, and reviewing upload/download history.

## Features

- Drag-and-drop file selection
- Browse-to-upload workflow
- File preview and upload progress feedback
- Generated alphanumeric file IDs
- Configurable file expiration periods
- File information lookup
- Upload and download history views
- Client-side login and signup flow
- Local persistence using `localStorage`
- Responsive desktop and mobile interface
- Modal dialogs and notification feedback

## Technology Stack

- **HTML5**
- **CSS3**
- **JavaScript**
- **localStorage**
- **Font Awesome**
- **Responsive web design**

## Project Notes

This repository is a front-end prototype. File uploads and downloads are simulated in the browser, and account/file state is stored locally in the user's browser rather than in a production backend.

The interface is useful as a UI/UX prototype for a fuller file-sharing platform that could later be connected to a real authentication service, object storage, and database.

## Running Locally

Because the project is static, you can open `index.html` directly in a browser or serve the folder with any static web server.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Portfolio

A public copy of my developer portfolio is also stored in:

```text
portfolio/index.html
```

## Developer

**Jim Rodmark Camus**  
BSIT — Network Technology  
GitHub: [@Sachibara](https://github.com/Sachibara)

## Related Project

See [Pyrewall](https://github.com/Sachibara/Pyrewall), a Python/PyQt6 Windows firewall and network-monitoring project.
