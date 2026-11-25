import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("resource Markdown rendering", () => {
  it("renders headings, emphasis and nested exercise lists", () => {
    const html = renderMarkdown(
      "# Fractions\n\n## Practice\n\nUse **equivalent** *fractions*.\n\n1. Simplify\n   - 2/4\n   - 3/6\n2. Compare",
    );

    expect(html).toContain("<h1>Fractions</h1>");
    expect(html).toContain("<h2>Practice</h2>");
    expect(html).toContain("<strong>equivalent</strong> <em>fractions</em>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>2/4</li>");
  });

  it("supports tables, quotes, links and code without interpreting code as HTML", () => {
    const html = renderMarkdown([
      "> Hint", "", "[Reference](https://example.com/lesson)", "",
      "| Value | Double |", "| --- | --- |", "| 2 | 4 |", "",
      "```html", "<script>alert(1)</script>", "```",
    ].join("\n"));

    expect(html).toContain("<blockquote>");
    expect(html).toContain('<a href="https://example.com/lesson">Reference</a>');
    expect(html).toContain("<table>");
    expect(html).toContain("<td>4</td>");
    expect(html).toContain('<pre><code class="language-html">&lt;script&gt;');
    expect(html).not.toContain("<script>");
  });

  it("preserves plain text line breaks and mathematical comparisons", () => {
    expect(renderMarkdown("2 < 3\n4 > 1")).toBe("<p>2 &lt; 3<br>\n4 &gt; 1</p>\n");
    expect(renderMarkdown("")).toBe("");
  });

  it("keeps display delimiters inline when they share a line with text", () => {
    const html = renderMarkdown("P(Evento)= $$\\frac{1}{6}$$");

    expect(html).toContain("P(Evento)=");
    expect(html).toContain("katex");
    expect(html).not.toContain('class="math-block"');
  });

  it("renders standalone display delimiters as a block", () => {
    const html = renderMarkdown("$$\\frac{1}{6}$$");

    expect(html).toContain('class="math-block"');
    expect(html).toContain("katex-display");
  });

  it("escapes raw HTML from imported and authored resources", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror="alert(1)">');

    expect(html).not.toMatch(/<(script|img)\b/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it.each([
    "[click](javascript:alert%281%29)",
    "[click](jav&#x61;script:alert%281%29)",
    "[click](vbscript:msgbox%281%29)",
    "[click](data:text/html;base64,PHNjcmlwdD4=)",
    "![image](javascript:alert%281%29)",
  ])("rejects executable URLs: %s", (source) => {
    expect(renderMarkdown(source)).not.toMatch(/<(a|img)\b/);
  });
});
