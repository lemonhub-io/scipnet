import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Link } from 'react-router-dom';
import type { Components } from 'react-markdown';

// Bare "/media/…" lines still embed images — the pre-Markdown convention stays valid.
const BARE_MEDIA = /^(\/media\/[\w\-./]+)\s*$/gm;

const components: Components = {
  a({ href, children }) {
    const url = href ?? '';
    if (url.startsWith('/')) return <Link to={url}>{children}</Link>;
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    const url = typeof src === 'string' ? src : '';
    if (url.startsWith('/media/')) {
      return <img className="post-img" src={url} alt={alt ?? ''} loading="lazy" />;
    }
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {alt || url}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

/** Renders post bodies as Markdown (GFM + single-newline breaks). Raw HTML is not rendered. */
export function PostBody({ body }: { body: string }) {
  const md = body.replace(BARE_MEDIA, '![]($1)');
  return (
    <div className="post-body">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {md}
      </ReactMarkdown>
    </div>
  );
}
