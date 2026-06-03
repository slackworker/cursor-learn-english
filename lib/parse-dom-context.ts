export type DomContextBlock = {
  domPath: string;
  position: string;
  reactComponent: string;
  htmlElement: string;
};

export type ParsedUserPrompt = {
  domContexts: DomContextBlock[];
  body: string;
};

function parseBlockFields(blockText: string): DomContextBlock | null {
  const domMatch = blockText.match(/DOM Path:\s*([^\n]+)/);
  const posMatch = blockText.match(/Position:\s*([^\n]+)/);
  const reactMatch = blockText.match(/React Component:\s*([^\n]+)/);
  const htmlMatch = blockText.match(/HTML Element:\s*([\s\S]+)/i);
  if (!domMatch || !htmlMatch) return null;
  return {
    domPath: domMatch[1].trim(),
    position: posMatch?.[1]?.trim() ?? "",
    reactComponent: reactMatch?.[1]?.trim() ?? "",
    htmlElement: htmlMatch[1].trim(),
  };
}

/** Slice HTML element value; trailing plain text before the next DOM block belongs in the prompt body. */
function sliceHtmlElementValue(rest: string): {
  html: string;
  trailingText: string;
  consumed: number;
} {
  const trimmed = rest.trimStart();
  const offset = rest.length - trimmed.length;
  const lt = trimmed.indexOf("<");
  if (lt === -1) {
    const nextDom = trimmed.search(/\bDOM Path:/);
    const html = (nextDom === -1 ? trimmed : trimmed.slice(0, nextDom)).trim();
    return {
      html,
      trailingText: "",
      consumed: offset + (nextDom === -1 ? trimmed.length : nextDom),
    };
  }

  const fromTag = trimmed.slice(lt);
  const openMatch = fromTag.match(/^<(\w+)(?:\s[^>]*)?>/);
  if (openMatch) {
    const tag = openMatch[1];
    const closeSeq = `</${tag}>`;
    const closeIdx = fromTag.indexOf(closeSeq, openMatch[0].length);
    if (closeIdx !== -1) {
      const htmlEnd = closeIdx + closeSeq.length;
      const html = fromTag.slice(0, htmlEnd);
      const afterHtml = fromTag.slice(htmlEnd);
      const nextDom = afterHtml.search(/\s*DOM Path:/);
      if (nextDom !== -1) {
        return {
          html,
          trailingText: afterHtml.slice(0, nextDom).trim(),
          consumed: offset + lt + htmlEnd + nextDom,
        };
      }
      return {
        html,
        trailingText: afterHtml.trim(),
        consumed: offset + trimmed.length,
      };
    }
  }

  const nextDom = fromTag.search(/>\s*DOM Path:/);
  if (nextDom !== -1) {
    const html = fromTag.slice(0, nextDom + 1).trim();
    return {
      html,
      trailingText: "",
      consumed: offset + lt + nextDom + 1,
    };
  }
  return {
    html: fromTag.trim(),
    trailingText: "",
    consumed: offset + trimmed.length,
  };
}

const INLINE_BLOCK_HEADER =
  /DOM Path:\s*([^\n]+)\nPosition:\s*([^\n]+)\nReact Component:\s*([^\n]+)\nHTML Element:\s*/g;

function extractBracketDomBlocks(text: string): {
  blocks: DomContextBlock[];
  remainder: string;
} {
  const blocks: DomContextBlock[] = [];
  let remainder = text;
  const bracketRe = /^【([\s\S]*?)】\s*/;
  let match = remainder.match(bracketRe);
  while (match) {
    const parsed = parseBlockFields(match[1]);
    if (parsed) blocks.push(parsed);
    remainder = remainder.slice(match[0].length);
    match = remainder.match(bracketRe);
  }
  return { blocks, remainder };
}

function extractInlineDomBlocks(text: string): {
  blocks: DomContextBlock[];
  bodyParts: string[];
} {
  const blocks: DomContextBlock[] = [];
  const bodyParts: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;

  INLINE_BLOCK_HEADER.lastIndex = 0;
  while ((m = INLINE_BLOCK_HEADER.exec(text))) {
    const before = text.slice(cursor, m.index).trim();
    if (before) bodyParts.push(before);

    const afterHeader = text.slice(m.index + m[0].length);
    const { html, trailingText, consumed } = sliceHtmlElementValue(afterHeader);
    blocks.push({
      domPath: m[1].trim(),
      position: m[2].trim(),
      reactComponent: m[3].trim(),
      htmlElement: html,
    });
    if (trailingText) bodyParts.push(trailingText);
    cursor = m.index + m[0].length + consumed;
    INLINE_BLOCK_HEADER.lastIndex = cursor;
  }

  const tail = text.slice(cursor).trim();
  if (tail) bodyParts.push(tail);
  return { blocks, bodyParts };
}

/** Split Cursor browser DOM picker metadata from the user's actual question text. */
export function parseUserPromptWithDomContext(raw: string): ParsedUserPrompt {
  const trimmed = raw.trim();
  if (!trimmed) return { domContexts: [], body: "" };

  const { blocks: bracketBlocks, remainder: afterBrackets } =
    extractBracketDomBlocks(trimmed);

  if (bracketBlocks.length > 0 && !/\bDOM Path:/.test(afterBrackets)) {
    return {
      domContexts: bracketBlocks,
      body: afterBrackets.trim(),
    };
  }

  if (!/\bDOM Path:/.test(trimmed)) {
    return { domContexts: [], body: trimmed };
  }

  const { blocks: inlineBlocks, bodyParts } = extractInlineDomBlocks(trimmed);
  const allBlocks = [...bracketBlocks, ...inlineBlocks];
  const body = bodyParts.join("\n\n").trim();

  return {
    domContexts: allBlocks,
    body: body || (allBlocks.length > 0 ? "" : trimmed),
  };
}

/** Short label for chip: tag name only (matches Cursor DOM picker badge). */
export function domContextChipLabel(htmlElement: string): string {
  const cleaned = htmlElement.replace(/\[REDACTED\]/g, "").trim();
  const openTag = cleaned.match(/^<(\w+)/);
  return openTag ? `<${openTag[1]}>` : "element";
}

export function domContextTooltip(block: DomContextBlock): string {
  return [
    `DOM Path: ${block.domPath}`,
    block.position ? `Position: ${block.position}` : null,
    block.reactComponent ? `React Component: ${block.reactComponent}` : null,
    `HTML Element: ${block.htmlElement}`,
  ]
    .filter(Boolean)
    .join("\n");
}
