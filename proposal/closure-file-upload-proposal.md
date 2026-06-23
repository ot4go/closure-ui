# `<closure-file-upload>` — multipart upload control — proposal

> Internal planning note. Status: **exploration / planning only** — nothing here
> is committed. It scopes a dedicated upload component that lives **outside** the
> closure form-serialization layer, because binary uploads need a different
> transport (multipart) and a different authorization model.
>
> Background: closure-ui's form layer (`<closure-template>` / `<target-closure>`)
> repackages fields into URL-encoded / JSON bodies and **does not transport
> binaries** — an `<input type=file>` arrives at the server as the sentinel
> string `"[object File]"` (documented). File uploads therefore need their own
> path, not another `send-behavior`.

---

## 1. Why a dedicated component (and not a `send-behavior`)

The closure flow is deliberately text-oriented: it gathers fields, URL-encodes
or JSON-stringifies them, and the server replies with `<closure-response>`
directives. Binary files don't fit that pipe:

- `URLSearchParams(new FormData(form))` coerces a `File` to `"[object File]"`.
- `JSON.stringify` drops it to `{}`.
- Even the `submit` path rebuilds a hidden-input form, losing the file.

A real upload needs **`multipart/form-data`**, which the browser **streams from
disk** (no RAM blow-up, GB-scale safe). That is a different transport — so it
belongs in its **own component**, keeping the generic closure layer simple.

> Design rule that fell out of the discussion: **send is its own; response is
> shared.** The upload transports multipart by itself, but its server reply can
> reuse the same `ClosureResponse` pipeline as everything else.

## 2. Memory model (why multipart is the right transport)

| Action | Loads file into page memory? |
|---|---|
| Selecting a file (`<input type=file>`) | ❌ no — `File` is a lazy disk handle (metadata only) |
| `form.submit()` native multipart | ❌ no — browser streams from disk |
| `fetch(url, { body: FormData })` (raw) | ❌ no — disk-backed `Blob`, streamed |
| `URLSearchParams(FormData)` / `JSON.stringify` | — (data loss, not memory) |
| `await file.arrayBuffer()` / `FileReader` | ✅ yes — whole file into RAM |

The component must **never** read the file (`arrayBuffer`/`FileReader`); it only
hands the `File`/`FormData` to the network layer, which streams it.

## 3. Authorization model — the server decides

The component is a **dumb transport**; the **endpoint is the authorization
boundary**. The server-rendered page bakes a context identifier into the upload
URL, and the backend cross-references it with the **session cookie** to accept
or deny:

- Path style: `url="/uuid:7f3a9c…/upload/"`
- Query style: `url="/upload/?upload=7f3a9c…"`

The component sends `credentials: 'same-origin'` so the **cookie rides along**;
the backend returns `2xx` (accepted) or `4xx` (denied). The component decides
nothing about who may upload what.

## 4. Proposed markup & API

```html
<closure-file-upload
    url="/uuid:7f3a9c…/upload/"          <!-- context id baked in by the server -->
    accept="image/*,.pdf"
    multiple
    progress
    response-parse="closure-response"     <!-- optional: pipe reply through ClosureResponse -->
    response-lightbox-id="result">
  <span slot="prompt">Drop files or click to upload</span>
</closure-file-upload>
```

| Attribute | Description |
|---|---|
| `url="x"` | multipart POST destination (carries the context id; cookie does auth) |
| `accept="x"` | mirrors the native `<input accept>` filter |
| `multiple` | allow selecting / dropping several files |
| `progress` | show an upload progress bar (requires the XHR transport, see §5) |
| `auto` | start uploading on selection instead of waiting for a submit button |
| `field="x"` | multipart field name (default `file`) |
| `response-parse="closure-response"` | run the server reply through `ClosureResponse` |
| `response-target-id` / `response-lightbox-id` | where the reply (non-closure HTML) goes |

Slots: `prompt` (drop-zone label), optional `preview` rendering hook.

Properties / events:

| Member | Description |
|---|---|
| `.files` | the staged `File` list |
| `upload-progress` event | `{ loaded, total, percent }` (XHR transport) |
| `upload-done` event | `{ status, response }` on completion |
| `upload-error` event | `{ status, error }` on failure |

## 5. Transport — fetch vs XHR

| Transport | Use when | Trade-off |
|---|---|---|
| `fetch(url, { body: FormData, credentials })` | no progress needed | clean, but **fetch can't report upload progress** |
| `XMLHttpRequest` (`xhr.upload.onprogress`) | `progress` attribute set | a few more lines, gives a progress bar |

Both stream from disk (no RAM). The component picks XHR when `progress` is set,
fetch otherwise. **Never** `URLSearchParams` — always raw `FormData` so the
browser sets the `multipart/form-data` boundary.

## 6. Response handling — reuse the ecosystem

Send is bespoke (multipart), but the **reply reuses `ClosureResponse`**: on a
`2xx` the server can return a `<closure-response>` that closes a lightbox,
**refreshes a grid** (`dispatch-event refresh` / `refresh-row` at a grid id),
shows a status, etc. — exactly like a `<closure-template>` response. A `4xx`
(denied) takes the failure path. This keeps uploads integrated with the rest of
the UI without going through the form-serialization layer.

```html
<!-- server reply after a successful upload -->
<closure-response>
  <response-item type="set-text" target-id="status" value="Uploaded"></response-item>
  <response-item type="dispatch-event" event="refresh" target-id="docsGrid"></response-item>
</closure-response>
```

## 7. Nice-to-haves (later)

- Drag-and-drop drop-zone styling (themeable via CSS variables, like the rest).
- Client-side `accept` / max-size validation **before** sending.
- Per-file progress + cancel (XHR `abort`) for `multiple`.
- Image thumbnail preview via `URL.createObjectURL` (a reference, **not** a read
  — no RAM cost), revoked after use.

## 8. Open questions

- **Default transport:** always XHR (uniform, progress-capable) vs fetch unless
  `progress` is requested?
- **Chunked / resumable** uploads (large files, flaky networks) — out of scope
  for v1, but the URL/auth model leaves room (the context id can carry an upload
  session).
- **CSRF:** the cookie authorizes; does the endpoint also want a token? If so,
  expose a `token`/`data-*` passthrough added as a multipart field.
- **Multiple files semantics:** one request with all files, or one request per
  file (independent progress / failure)? Probably per-file for `multiple`.
