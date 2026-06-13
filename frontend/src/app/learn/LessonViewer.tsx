'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft } from 'lucide-react';

interface LessonViewerProps {
  slug: string;
  onBack: () => void;
  onNavigate: (slug: string) => void;
}

export default function LessonViewer({ slug, onBack, onNavigate }: LessonViewerProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    // Static asset served from frontend/public/learn/ — plain fetch is correct here.
    fetch(`/learn/${slug}.md`)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load lesson (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setError('This lesson could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg transition-colors"
      >
        <ArrowLeft size={16} /> All lessons
      </button>

      {loading && <p className="text-muted">Loading lesson…</p>}
      {error && <p className="text-danger">{error}</p>}

      {!loading && !error && (
        <div className="learn-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const h = href || '';
                // Sibling lesson link (e.g. 02-frontend-tour.md) → switch lessons.
                if (/^[\w-]+\.md(#.*)?$/.test(h)) {
                  const target = h.replace(/\.md.*$/, '');
                  return (
                    <button type="button" className="learn-md-link" onClick={() => onNavigate(target)}>
                      {children}
                    </button>
                  );
                }
                // External link → open in a new tab.
                if (/^https?:\/\//.test(h)) {
                  return (
                    <a href={h} target="_blank" rel="noreferrer" className="learn-md-link">
                      {children}
                    </a>
                  );
                }
                // Repo file path (e.g. ../../api/views.py) — not clickable in the
                // browser; show it as inline code so readers know to open it in the editor.
                return <code className="learn-md-path">{children}</code>;
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
