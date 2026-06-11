import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

export default function PackagePickPage() {
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/releases/in-progress/package-pick")
      .then((r) => r.json())
      .then((data) => {
        setFilename(data.filename);
        setContent(data.content);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (content === null || !editorRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        oneDark,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [content]);

  return (
    <div className="package-pick-page">
      <div className="topbar">
        <h1 style={{ margin: 0, fontSize: 24 }}>Package Pick</h1>
      </div>

      {loading && <p style={{ color: "#94a3b8" }}>Loading...</p>}

      {!loading && content !== null && (
        <>
          <div className="editor-header">{filename}</div>
          <div className="editor-container" ref={editorRef} />
        </>
      )}
    </div>
  );
}
