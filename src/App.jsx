import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill";
import Quill from "quill";

// ---- Quill config: allow inline font sizes & font families ----
const Size = Quill.import("attributors/style/size");
Size.whitelist = ["12px","14px","16px","18px","20px","24px","28px","32px","36px","48px","60px","72px"];
Quill.register(Size, true);

const Font = Quill.import("attributors/style/font");
Font.whitelist = ["Inter","Arial","Georgia","Times New Roman","Garamond","Verdana","Courier New","Monaco"];
Quill.register(Font, true);

const LS_KEY = "cybersoft.word.autosave.v2";

export default function App() {
  const quillRef = useRef(null);
  const [value, setValue] = useState(
    '<h1>Welcome to Cybersoft Word</h1><p>Type here. Use the toolbar above.</p>'
  );
  const [fileName, setFileName] = useState("Untitled.csw");
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fileHandleRef = useRef(null);
  const [counts, setCounts] = useState({ words: 0, chars: 0, sel: "No selection" });
  const [findQ, setFindQ] = useState("");
  const [replaceQ, setReplaceQ] = useState("");

  // Toolbar + history
  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ font: Font.whitelist }],
          [{ size: Size.whitelist }],
          ["bold", "italic", "underline", "strike"],
          [{ script: "sub" }, { script: "super" }],
          [{ color: [] }, { background: [] }],
          [{ header: [1, 2, 3, false] }],
          [{ align: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "code-block"],
          ["link", "image"],
          ["clean"],
        ],
        handlers: { image: handleInsertImage },
      },
      history: { delay: 500, maxStack: 200, userOnly: true },
    }),
    []
  );

  const formats = [
    "font","size","bold","italic","underline","strike","script",
    "color","background","header","align","list","blockquote","code-block","link","image"
  ];

  // Load autosave
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && d.html) {
          setValue(d.html);
          setFileName(d.title || "Untitled.csw");
        }
      } catch {}
    }
  }, []);

  // Counts + autosave on change
  useEffect(() => {
    const editor = quillRef.current?.getEditor?.();
    if (editor) {
      const txt = editor.getText() || "";
      const words = (txt.trim().match(/\S+/g) || []).length;
      const sel = editor.getSelection();
      setCounts({
        words,
        chars: txt.length,
        sel: sel && sel.length ? `${sel.length} selected` : "No selection",
      });
    }
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ title: fileName, html: value, ts: Date.now() })
    );
  }, [value, fileName]);

  function markDirty() {
    setDirty(true);
  }

  // ---- Insert image (local file -> base64) ----
  function handleInsertImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const editor = quillRef.current.getEditor();
        const range = editor.getSelection(true);
        editor.insertEmbed(range ? range.index : 0, "image", reader.result, "user");
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // ---- File helpers ----
  function wrapAsHTML(inner) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const title = esc(fileName || "Untitled");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${inner}</body></html>`;
  }

  function stripInner(html) {
    const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1] : html;
  }

  function fallbackDownload(blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName || "Untitled.csw";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
    setDirty(false);
  }

  async function saveAs() {
    const blob = new Blob([wrapAsHTML(value)], { type: "text/html" });
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName || "Untitled.csw",
          types: [{ description: "Cybersoft/HTML", accept: { "text/html": [".csw", ".html"] } }],
        });
        fileHandleRef.current = handle;
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        setDirty(false);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    fallbackDownload(blob);
  }

  async function save() {
    if (fileHandleRef.current) {
      try {
        const w = await fileHandleRef.current.createWritable();
        await w.write(new Blob([wrapAsHTML(value)], { type: "text/html" }));
        await w.close();
        setDirty(false);
        return;
      } catch {
        // fall through to Save As
      }
    }
    await saveAs();
  }

  async function openFile() {
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Cybersoft/HTML/TXT",
              accept: { "text/html": [".csw", ".html", ".htm"], "text/plain": [".txt"] },
            },
          ],
        });
        fileHandleRef.current = handle;
        const file = await handle.getFile();
        const text = await file.text();
        setValue(stripInner(text));
        setFileName(file.name);
        setDirty(false);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    // Fallback input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csw,.html,.htm,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      setValue(stripInner(text));
      setFileName(file.name);
      setDirty(false);
    };
    input.click();
  }

  function exportHtml() {
    const blob = new Blob([wrapAsHTML(value)], { type: "text/html" });
    fallbackDownload(blob);
  }

  function doPrint() {
    const w = window.open("", "_blank");
    w.document.write(wrapAsHTML(value));
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  // ---- Find / Replace ----
  function findNext() {
    const editor = quillRef.current.getEditor();
    if (!findQ) return;
    const txt = editor.getText();
    const start = (editor.getSelection()?.index || 0) + 1;
    const idx = txt.toLowerCase().indexOf(findQ.toLowerCase(), start);
    const i = idx >= 0 ? idx : txt.toLowerCase().indexOf(findQ.toLowerCase(), 0);
    if (i >= 0) editor.setSelection(i, findQ.length, "user");
  }

  function replaceOne() {
    const editor = quillRef.current.getEditor();
    if (!findQ) return;
    const sel = editor.getSelection();
    if (
      sel &&
      sel.length &&
      editor.getText(sel.index, sel.length).trim().toLowerCase() === findQ.toLowerCase()
    ) {
      editor.deleteText(sel.index, sel.length, "user");
      editor.insertText(sel.index, replaceQ, "user");
      editor.setSelection(sel.index + replaceQ.length, 0, "user");
    } else {
      findNext();
    }
    markDirty();
  }

  function replaceAll() {
    const editor = quillRef.current.getEditor();
    if (!findQ) return;
    const html = editor.root.innerHTML;
    const safe = findQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const replaced = html.replace(new RegExp(safe, "gi"), () => {
      const wrap = document.createElement("div");
      wrap.textContent = replaceQ;
      return wrap.innerHTML;
    });
    editor.root.innerHTML = replaced;
    setValue(editor.root.innerHTML);
    markDirty();
  }

  return (
    <div className="shell">
      <header>
        <div className="logo">⚡ Cybersoft Word</div>
        <input
          className="title-input"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
        />
        <span className="pill">{dirty ? "● unsaved" : "● autosaved"}</span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={openFile}>Open</button>
        <button className="btn" onClick={save}>Save</button>
        <button className="btn" onClick={saveAs}>Save As</button>
        <button className="btn" onClick={exportHtml}>Export HTML</button>
        <button className="btn" onClick={doPrint}>Print / PDF</button>
      </header>

      <nav className="toolbar">
        <div className="group">
          <input
            className="btn"
            placeholder="Find"
            value={findQ}
            onChange={(e) => setFindQ(e.target.value)}
            style={{ width: 160 }}
          />
          <input
            className="btn"
            placeholder="Replace"
            value={replaceQ}
            onChange={(e) => setReplaceQ(e.target.value)}
            style={{ width: 160 }}
          />
          <button className="btn" onClick={findNext}>Find ▶</button>
          <button className="btn" onClick={replaceOne}>Replace</button>
          <button className="btn" onClick={replaceAll}>Replace All</button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="group">
          <label className="btn" style={{ cursor: "default" }}>Zoom</label>
          <select
            className="btn"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          >
            <option value={0.9}>90%</option>
            <option value={1}>100%</option>
            <option value={1.1}>110%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>
        </div>
      </nav>

      <main id="editor-wrap">
        <div className="paper scaled" style={{ transform: `scale(${zoom})` }}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            modules={modules}
            formats={formats}
            value={value}
            onChange={(html) => {
              setValue(html);
              markDirty();
            }}
          />
        </div>
      </main>

      <footer
        className="statusbar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div className="pill">{counts.words} words</div>
        <div className="pill">{counts.chars} chars</div>
        <div className="pill">{counts.sel}</div>
      </footer>
    </div>
  );
}
