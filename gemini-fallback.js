'use strict';

/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // GEMINI FALLBACK v1.0
   Automatic model fallback when primary hits high demand
   ═══════════════════════════════════════════════════════════════════ */

const FALLBACK_CHAIN = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
];

function getFallbackModels(primaryModel) {
    const chain = [primaryModel];
    for (const m of FALLBACK_CHAIN) {
        if (m !== primaryModel && !chain.includes(m)) {
            chain.push(m);
        }
    }
    return chain;
}

function isHighDemandError(data, status) {
    if (status === 503) return true;
    if (status === 429) return true;
    if (data && data.error) {
        const msg = String(data.error.message || '').toLowerCase();
        if (msg.includes('high demand') ||
            msg.includes('overloaded') ||
            msg.includes('unavailable') ||
            msg.includes('try again later') ||
            msg.includes('spikes in demand')) {
            return true;
        }
    }
    return false;
}

function isModelNotFoundError(data, status) {
    if (status === 404) return true;
    if (data && data.error) {
        const msg = String(data.error.message || '').toLowerCase();
        if (msg.includes('not found') ||
            msg.includes('not supported') ||
            msg.includes('does not exist')) {
            return true;
        }
    }
    return false;
}

module.exports = {
    FALLBACK_CHAIN,
    getFallbackModels,
    isHighDemandError,
    isModelNotFoundError,
};