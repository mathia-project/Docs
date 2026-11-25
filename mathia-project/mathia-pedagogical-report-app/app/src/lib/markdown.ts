import MarkdownIt from "markdown-it";
import katex from "katex";

// Resource content may be imported or user-authored. Keep raw HTML disabled
// and retain markdown-it's default URL validation before using innerHTML.
const markdown = new MarkdownIt({ html: false, breaks: true });

export function renderMarkdown(source: string): string {
  const formulas: Array<{ token: string; html: string; block: boolean }> = [];
  let formulaIndex = 0;

  const addFormula = (formula: string, requestedBlock: boolean, matchStart: number, matchEnd: number) => {
    // A display delimiter used after text on the same line is still inline
    // content. Rendering it as a display formula inside a <p> makes KaTeX's
    // vertical list overlap the surrounding text.
    const lineStart = source.lastIndexOf("\n", matchStart) + 1;
    const lineEndIndex = source.indexOf("\n", matchEnd);
    const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
    const standalone = source.slice(lineStart, matchStart).trim() === ""
      && source.slice(matchEnd, lineEnd).trim() === "";
    const block = requestedBlock && standalone;
    const token = `${block ? "MATH_BLOCK" : "MATH_INLINE"}_${formulaIndex++}`;
    formulas.push({
      token,
      block,
      html: katex.renderToString(formula.trim(), { displayMode: block, throwOnError: false }),
    });
    return token;
  };

  // Protect LaTeX before Markdown parsing, then put the trusted KaTeX output
  // back into the generated HTML. This supports the formats produced by the
  // AI resources: $$...$$, \[...\], $...$ and \(...\).
  const protectedSource = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (match: string, formula: string, offset: number) => {
      return addFormula(formula, true, offset, offset + match.length);
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (match: string, formula: string, offset: number) => {
      return addFormula(formula, true, offset, offset + match.length);
    })
    .replace(/\$([^$\n]+?)\$/g, (match: string, formula: string, offset: number) => {
      return addFormula(formula, false, offset, offset + match.length);
    })
    .replace(/\\\(([^\n]+?)\\\)/g, (match: string, formula: string, offset: number) => {
      return addFormula(formula, false, offset, offset + match.length);
    });

  let rendered = markdown.render(protectedSource);
  for (const formula of formulas) {
    const escapedToken = formula.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenPattern = new RegExp(escapedToken, "g");
    rendered = formula.block
      ? rendered.replace(new RegExp(`<p>${escapedToken}</p>`, "g"), `<div class="math-block">${formula.html}</div>`)
      : rendered.replace(tokenPattern, formula.html);
  }
  return rendered;
}
