// AI-based file naming utility
// Generates meaningful file names based on extracted text content

/**
 * Generate an AI-based filename from extracted text
 * @param {string} extractedText - The text extracted from the image
 * @param {string} originalExtension - Original file extension
 * @returns {string} - AI-generated filename
 */
function generateAIFileName(extractedText, originalExtension) {
    if (!extractedText || extractedText.trim().length === 0) {
        return `empty_document_${Date.now()}${originalExtension}`;
    }

    // Clean and prepare the text
    const cleanText = extractedText
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Extract keywords and generate filename
    const keywords = extractKeywords(cleanText);
    const topic = identifyTopic(keywords, cleanText);

    // Create filename from topic
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `${sanitizeFileName(topic)}_${timestamp}${originalExtension}`;

    return fileName;
}

/**
 * Extract important keywords from text
 * @param {string} text - Input text
 * @returns {Array} - Array of keywords
 */
function extractKeywords(text) {
    // Common stop words to ignore
    const stopWords = new Set([
        'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
        'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this',
        'it', 'from', 'be', 'are', 'was', 'were', 'been', 'have', 'has',
        'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
        'may', 'might', 'can', 'so', 'if', 'than', 'all', 'any', 'some'
    ]);

    // Extract words and filter
    const words = text.toLowerCase()
        .match(/\b[a-z]+\b/g) || [];

    // Count word frequency
    const wordCount = {};
    words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    });

    // Sort by frequency and get top keywords
    const keywords = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

    return keywords;
}

/**
 * Identify the main topic from keywords and text
 * @param {Array} keywords - Array of keywords
 * @param {string} text - Full text
 * @returns {string} - Topic name
 */
function identifyTopic(keywords, text) {
    const textLower = text.toLowerCase();

    // Step 1: Detect document type first
    const docType = detectDocumentType(textLower);

    // Step 2: Extract contextual information
    const context = extractContext(text, textLower, docType);

    // Step 3: Build filename
    let nameParts = [];

    if (docType !== 'document') {
        nameParts.push(docType);
    }

    if (context.company) {
        nameParts.push(context.company);
    }

    if (context.subject) {
        nameParts.push(context.subject);
    }

    if (context.date) {
        nameParts.push(context.date);
    }

    if (context.amount) {
        nameParts.push(context.amount);
    }

    // If we have a good name, use it
    if (nameParts.length > 0) {
        return nameParts.slice(0, 4).join('_');
    }

    // Fallback to keywords
    if (keywords.length > 0) {
        const topKeywords = keywords.slice(0, 3);
        return topKeywords.join('_');
    }

    // Last fallback: use first meaningful words
    const firstWords = text
        .split(' ')
        .filter(word => word.length > 3)
        .slice(0, 3)
        .join('_');

    return firstWords ? firstWords.toLowerCase() : 'document';
}

/**
 * Detect document type with enhanced patterns
 * @param {string} textLower - Lowercase text
 * @returns {string} - Document type
 */
function detectDocumentType(textLower) {
    // Invoice patterns
    if (textLower.match(/\b(invoice|bill|billing|payment due|amount due|total amount|subtotal)\b/)) {
        return 'invoice';
    }

    // Receipt patterns
    if (textLower.match(/\b(receipt|paid|transaction|purchase|sale)\b/) &&
        textLower.match(/\$\d+|\d+\.\d{2}/)) {
        return 'receipt';
    }

    // Contract patterns
    if (textLower.match(/\b(contract|agreement|terms and conditions|hereby agree|party|parties)\b/)) {
        return 'contract';
    }

    // Letter/Email patterns
    if (textLower.match(/\b(dear |sincerely|regards|yours truly|subject:)\b/)) {
        return 'letter';
    }

    // Report patterns
    if (textLower.match(/\b(report|summary|analysis|findings|conclusion|executive summary)\b/)) {
        return 'report';
    }

    // Certificate patterns
    if (textLower.match(/\b(certificate|certify|awarded|completion|achievement)\b/)) {
        return 'certificate';
    }

    // Form patterns
    if (textLower.match(/\b(form|application|questionnaire|survey)\b/) &&
        textLower.match(/\b(name|address|date|signature)\b/)) {
        return 'form';
    }

    // Memo/Note patterns
    if (textLower.match(/\b(memo|memorandum|note|to:|from:|re:)\b/)) {
        return 'memo';
    }

    // ID/Passport patterns
    if (textLower.match(/\b(passport|identification|id card|driver license|permit)\b/)) {
        return 'id';
    }

    // Ticket patterns
    if (textLower.match(/\b(ticket|boarding pass|admission|entry)\b/)) {
        return 'ticket';
    }

    return 'document';
}

/**
 * Extract contextual information from text
 * @param {string} text - Original text
 * @param {string} textLower - Lowercase text
 * @param {string} docType - Document type
 * @returns {object} - Context object
 */
function extractContext(text, textLower, docType) {
    const context = {};

    // Extract company name (usually in first few lines or after "from")
    const companyMatch = text.match(/(?:from|company|vendor)[\s:]+([A-Z][A-Za-z\s&,\.]{2,30})/i);
    if (companyMatch) {
        context.company = sanitizeFileName(companyMatch[1].trim()).substring(0, 20);
    }

    // Extract subject (for letters/memos)
    const subjectMatch = text.match(/(?:subject|re)[\s:]+([A-Za-z\s]{3,40})/i);
    if (subjectMatch) {
        context.subject = sanitizeFileName(subjectMatch[1].trim()).substring(0, 20);
    }

    // Extract date (various formats)
    const dateMatch = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i);
    if (dateMatch) {
        context.date = dateMatch[1].replace(/[\/\s,]/g, '-');
    }

    // Extract amount (for invoices/receipts)
    if (docType === 'invoice' || docType === 'receipt') {
        const amountMatch = text.match(/(?:total|amount|sum)[\s:$]*(\d+[\.,]\d{2})/i);
        if (amountMatch) {
            context.amount = amountMatch[1].replace(',', '');
        }
    }

    // Extract title from beginning (first line or heading)
    if (!context.subject && !context.company) {
        const lines = text.split('\n').filter(l => l.trim().length > 3);
        if (lines.length > 0) {
            const firstLine = lines[0].trim();
            if (firstLine.length < 50 && firstLine.length > 3) {
                context.subject = sanitizeFileName(firstLine).substring(0, 30);
            }
        }
    }

    return context;
}

/**
 * Sanitize filename to remove invalid characters
 * @param {string} name - Input name
 * @returns {string} - Sanitized filename
 */
function sanitizeFileName(name) {
    return name
        .replace(/[^a-z0-9_\-]/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 50) || 'unnamed';
}

module.exports = {
    generateAIFileName,
    extractKeywords,
    identifyTopic,
    sanitizeFileName
};
