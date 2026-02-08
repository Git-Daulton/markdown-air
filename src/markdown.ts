import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

markdown.validateLink = (url: string): boolean => {
  const normalized = url.trim().toLowerCase();
  return (
    !normalized.startsWith("javascript:") &&
    !normalized.startsWith("vbscript:") &&
    !normalized.startsWith("data:")
  );
};

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
