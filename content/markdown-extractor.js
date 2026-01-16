// ========================================
// Markdown Extractor Module
// Uses Readability.js + Turndown.js to extract clean markdown from web pages
// ========================================

/**
 * Extract clean markdown content from the current page
 * @returns {Object} { success: boolean, markdown: string, metadata: object, error?: string }
 */
function extractPageMarkdown() {
    try {
        // Clone the document to avoid modifying the original
        const documentClone = document.cloneNode(true);

        // Use Readability to extract main content
        const reader = new Readability(documentClone, {
            // Keep classes for better structure preservation
            keepClasses: false,
            // Disable image dimension attributes
            serializer: (el) => el
        });

        const article = reader.parse();

        if (!article) {
            return {
                success: false,
                error: 'Failed to extract article content. This page may not have a clear main content area.'
            };
        }

        // Initialize Turndown for HTML to Markdown conversion
        const turndownService = new TurndownService({
            headingStyle: 'atx',  // Use # for headings
            hr: '---',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            fence: '```',
            emDelimiter: '_',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            linkReferenceStyle: 'full'
        });

        // Add custom rules for better markdown output

        // Preserve tables
        turndownService.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td']);

        // Better handling of code blocks
        turndownService.addRule('codeBlock', {
            filter: ['pre'],
            replacement: function (content, node) {
                const code = node.querySelector('code');
                const language = code ? (code.className.match(/language-(\w+)/) || [])[1] || '' : '';
                return '\n\n```' + language + '\n' + content + '\n```\n\n';
            }
        });

        // Filter out tracking pixels and tiny images
        turndownService.addRule('filterTinyImages', {
            filter: function (node) {
                if (node.nodeName === 'IMG') {
                    const width = parseInt(node.getAttribute('width')) || 0;
                    const height = parseInt(node.getAttribute('height')) || 0;
                    // Filter out 1x1 tracking pixels and very small images
                    if ((width > 0 && width < 10) || (height > 0 && height < 10)) {
                        return true;
                    }
                }
                return false;
            },
            replacement: function () {
                return ''; // Remove these images
            }
        });

        // Clean up image links - only keep meaningful ones
        turndownService.addRule('cleanImages', {
            filter: 'img',
            replacement: function (content, node) {
                const alt = node.getAttribute('alt') || '';
                const src = node.getAttribute('src') || '';

                // Skip if no alt text and src is a data URL or very long CDN URL
                if (!alt && (src.startsWith('data:') || src.length > 200)) {
                    return '';
                }

                // For GitHub user content URLs, simplify
                if (src.includes('githubusercontent.com') || src.includes('camo.githubusercontent')) {
                    return alt ? `![${alt}](image)` : '';
                }

                return alt ? `![${alt}](${src})` : '';
            }
        });

        // Clean up links - remove very long tracking URLs
        turndownService.addRule('cleanLinks', {
            filter: function (node) {
                if (node.nodeName === 'A') {
                    const href = node.getAttribute('href') || '';
                    // Filter out very long URLs (likely tracking/CDN)
                    if (href.length > 300) {
                        return true;
                    }
                }
                return false;
            },
            replacement: function (content) {
                // Just keep the text content, remove the link
                return content;
            }
        });

        // Convert article HTML to Markdown
        let markdown = turndownService.turndown(article.content);

        // Post-processing: clean up excessive newlines
        markdown = markdown.replace(/\n{4,}/g, '\n\n\n');

        // Remove standalone brackets and parentheses that might be leftover
        markdown = markdown.replace(/^\[\]\s*$/gm, '');
        markdown = markdown.replace(/^\(\)\s*$/gm, '');

        // Extract metadata
        const metadata = {
            title: article.title || document.title,
            byline: article.byline || extractAuthor(),
            excerpt: article.excerpt || '',
            siteName: article.siteName || extractSiteName(),
            publishedTime: extractPublishTime(),
            url: window.location.href,
            extractedAt: new Date().toISOString()
        };

        // Format final markdown with metadata header
        const fullMarkdown = formatMarkdownWithMetadata(markdown, metadata);

        return {
            success: true,
            markdown: fullMarkdown,
            metadata: metadata
        };

    } catch (error) {
        console.error('Error extracting markdown:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Format markdown with metadata header
 */
function formatMarkdownWithMetadata(markdown, metadata) {
    let header = '---\n';
    header += `title: ${metadata.title}\n`;
    if (metadata.byline) header += `author: ${metadata.byline}\n`;
    if (metadata.siteName) header += `site: ${metadata.siteName}\n`;
    if (metadata.publishedTime) header += `published: ${metadata.publishedTime}\n`;
    header += `url: ${metadata.url}\n`;
    header += `extracted: ${metadata.extractedAt}\n`;
    header += '---\n\n';

    return header + markdown;
}

/**
 * Try to extract author from common meta tags
 */
function extractAuthor() {
    const selectors = [
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="twitter:creator"]',
        '.author',
        '[rel="author"]'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            return el.getAttribute('content') || el.textContent?.trim() || '';
        }
    }
    return '';
}

/**
 * Try to extract site name from common meta tags
 */
function extractSiteName() {
    const selectors = [
        'meta[property="og:site_name"]',
        'meta[name="application-name"]',
        'meta[name="twitter:site"]'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            const content = el.getAttribute('content');
            if (content) return content;
        }
    }

    // Fallback to hostname
    return window.location.hostname;
}

/**
 * Try to extract publish time from common meta tags
 */
function extractPublishTime() {
    const selectors = [
        'meta[property="article:published_time"]',
        'meta[name="publish-date"]',
        'meta[name="date"]',
        'time[datetime]'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            const datetime = el.getAttribute('datetime') || el.getAttribute('content');
            if (datetime) return datetime;
        }
    }
    return '';
}

/**
 * Fallback extraction for pages where Readability fails
 * Simply extracts visible text from main content areas
 */
function fallbackExtraction() {
    const mainSelectors = [
        'main',
        'article',
        '[role="main"]',
        '#content',
        '#main',
        '.content',
        '.main'
    ];

    let mainContent = null;
    for (const selector of mainSelectors) {
        mainContent = document.querySelector(selector);
        if (mainContent) break;
    }

    if (!mainContent) {
        mainContent = document.body;
    }

    // Remove unwanted elements
    const unwanted = mainContent.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement');
    unwanted.forEach(el => el.remove());

    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(mainContent.innerHTML);

    return {
        success: true,
        markdown: markdown,
        metadata: {
            title: document.title,
            url: window.location.href,
            extractedAt: new Date().toISOString()
        }
    };
}
