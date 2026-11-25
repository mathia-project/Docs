import { createMemo, type Component } from "solid-js";
import { renderMarkdown } from "../../lib/markdown";
import "./markdown-content.css";

export const MarkdownContent: Component<{ content: string }> = (props) => {
  const html = createMemo(() => renderMarkdown(props.content));

  // Only renderMarkdown output reaches this sink: raw HTML is escaped and URLs are validated.
  // eslint-disable-next-line solid/no-innerhtml
  return <div class="markdown-content" innerHTML={html()} />;
};
