import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownPreview.css';

interface MarkdownPreviewProps {
  content: string;
  fontSize?: number;
}

export default function MarkdownPreview({ content, fontSize = 14 }: MarkdownPreviewProps) {
  return (
    <div
      className="markdown-preview"
      style={{ fontSize }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, ...props }) => <h1 className="md-h1" {...props}>{children}</h1>,
          h2: ({ children, ...props }) => <h2 className="md-h2" {...props}>{children}</h2>,
          h3: ({ children, ...props }) => <h3 className="md-h3" {...props}>{children}</h3>,
          h4: ({ children, ...props }) => <h4 className="md-h4" {...props}>{children}</h4>,
          h5: ({ children, ...props }) => <h5 className="md-h5" {...props}>{children}</h5>,
          h6: ({ children, ...props }) => <h6 className="md-h6" {...props}>{children}</h6>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return <code className="md-inline-code" {...props}>{children}</code>;
            }
            return (
              <code className={`md-code-block ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre className="md-pre" {...props}>{children}</pre>
          ),
          a: ({ children, href, ...props }) => (
            <a className="md-link" href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          table: ({ children, ...props }) => (
            <table className="md-table" {...props}>{children}</table>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="md-blockquote" {...props}>{children}</blockquote>
          ),
          hr: (props) => <hr className="md-hr" {...props} />,
          img: ({ src, alt, ...props }) => (
            <span className="md-img-placeholder" {...props}>
              [{alt || 'image'}: {src || 'no src'}]
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
