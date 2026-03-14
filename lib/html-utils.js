/**
 * Safely converts plain URLs in an HTML string into clickable styled <a> tags,
 * without breaking existing <a> tags or HTML attributes.
 */
export function autoLinkHtml(html) {
    if (!html) return html;

    let tempHtml = html;

    // 1. Protect existing <a> tags completely
    const aTagPlaceholders = [];
    tempHtml = tempHtml.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match) => {
        aTagPlaceholders.push(match);
        return `<__A_TAG_${aTagPlaceholders.length - 1}__>`;
    });

    // 2. Protect all other HTML tags (so we don't link inside src="..." or href="...")
    const htmlTagPlaceholders = [];
    tempHtml = tempHtml.replace(/<[^>]+>/g, (match) => {
        htmlTagPlaceholders.push(match);
        return `<__HTML_TAG_${htmlTagPlaceholders.length - 1}__>`;
    });

    // 3. Now we only have raw text. Convert URLs to blue links.
    // Since tags are encapsulated in <...>, the regex stopping at < works perfectly.
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    tempHtml = tempHtml.replace(urlRegex, (url) => {
        // Exclude trailing punctuation
        let cleanUrl = url;
        let suffix = '';
        if (/[.,;!?]$/.test(cleanUrl)) {
            suffix = cleanUrl.slice(-1);
            cleanUrl = cleanUrl.slice(0, -1);
        }
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${cleanUrl}</a>${suffix}`;
    });

    // 4. Restore regular HTML tags
    for (let i = 0; i < htmlTagPlaceholders.length; i++) {
        tempHtml = tempHtml.replace(`<__HTML_TAG_${i}__>`, () => htmlTagPlaceholders[i]);
    }

    // 5. Restore <a> tags
    for (let i = 0; i < aTagPlaceholders.length; i++) {
        tempHtml = tempHtml.replace(`<__A_TAG_${i}__>`, () => aTagPlaceholders[i]);
    }

    return tempHtml;
}
