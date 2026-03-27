/**
 * Dashboard Widgets Module
 * Renders live data widgets for the desktop command center bento layout.
 * Widgets: Weather, Reminders, CGL Compliance, Recent Clients, Quick Actions, Quick Launch.
 *
 * @module DashboardWidgets
 */
window.DashboardWidgets = (() => {
    'use strict';

    let _refreshInterval = null;
    let _complianceBgInterval = null;
    let _complianceBgFetching = false;
    const COMPLIANCE_BG_FETCH_INTERVAL = 60 * 60 * 1000; // 1 hour
    let _initialized = false;
    let _crumbTool = null;
    let _crumbTitle = null;

    // Weather cache
    let _weatherCache = null;
    let _weatherLocation = { lat: 45.63, lon: -122.67, name: 'Vancouver, WA' }; // fallback
    const WEATHER_CACHE_KEY = 'altech_weather_cache';
    const WEATHER_LOCATION_KEY = 'altech_weather_location';
    const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 min

    // ── SVG Icon Library (Lucide-style, 24×24, stroke-based) ──
    const ICONS = {
        // Sidebar & widget icons
        home:             '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        layoutDashboard:  '<svg viewBox="0 0 24 24"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="3" y="15" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/></svg>',
        briefcaseBusiness:'<svg viewBox="0 0 24 24"><path d="M12 12h.01"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
        bot:              '<svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
        scanLine:    '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
        messageCircle: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
        scale:       '<svg viewBox="0 0 24 24"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21H17"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
        filePlus:    '<svg viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/></svg>',
        clipboardCheck:'<svg viewBox="0 0 24 24"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
        bellRing:    '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M20 2c1.2 1.7 2 3.7 2 6"/></svg>',
        bird:        '<svg viewBox="0 0 24 24"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>',
        mailQuestion:'<svg viewBox="0 0 24 24"><path d="M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M18 15.28c.2-.4.5-.8.9-1a2.1 2.1 0 0 1 2.6.4c.3.4.5.8.5 1.3 0 1.3-2 2-2 2"/><path d="M20 22v.01"/></svg>',
        badgeHelp:   '<svg viewBox="0 0 24 24"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
        scanText:    '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="8" y1="12" y2="12"/><line x1="12" x2="17" y1="12" y2="12"/><line x1="7" x2="17" y1="16" y2="16"/><line x1="7" x2="13" y1="8" y2="8"/></svg>',
        telescope:   '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="2"/><path d="M22 22 16.05 16.05"/><path d="M10.4 21.9c5-1.4 6.2-3.2 6.5-6.7 0 0 .1-.2-.5-.8-1.6-1.5-3.8-2.4-5.7-3.5-2.3-1.4-4.2-3.1-5.5-5.4 0 0-.4-.2-.9.3-.7.7-1.1 1.7-1.1 2.6 0 4.3 3.2 8.5 7.2 13.5Z"/><path d="M14.5 15.7c.5.3.9.5 1.4.7"/><path d="M9.9 12.4c-.1 0-.2-.1-.3-.1"/></svg>',
        landmark:    '<svg viewBox="0 0 24 24"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>',
        carFront:    '<svg viewBox="0 0 24 24"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.354a2 2 0 0 0-1.853 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>',
        wallet:      '<svg viewBox="0 0 24 24"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
        zap:         '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        upload:      '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        shieldCheck: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
        bell:        '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
        search:      '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        mail:        '<svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
        calculator:  '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>',
        bookOpen:    '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        car:         '<svg viewBox="0 0 24 24"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
        fileText:    '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        // UI icons
        chevronLeft: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
        chevronRight:'<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
        moon:        '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        user:        '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        menu:        '<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        plus:        '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        star:        '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        check:       '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        alertCircle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        checkCircle: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        arrowRight:  '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
        sparkles:    '<svg viewBox="0 0 24 24"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>',
        clipboard:   '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
        phone:       '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        hawk:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 4 5 4 9c0 2 1 4 2.5 5.5L4 22l4-2 4 2 4-2 4 2-2.5-7.5C19 13 20 11 20 9c0-4-4-7-8-7z"/><path d="M12 2 9 8h6L12 2z"/><path d="M9 8c-1 2-1 4 0 6"/><path d="M15 8c1 2 1 4 0 6"/></svg>',
        bug:         '<svg viewBox="0 0 24 24"><path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>',
        edit:        '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        lock:        '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        userPlus:    '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
        dollarSign:  '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    };

    // Tool → Lucide icon mapping
    const TOOL_ICONS = {
        quoting:      'user',
        commercial:   'briefcaseBusiness',
        intake:       'bot',
        qna:          'messageCircle',
        quotecompare: 'scale',
        ezlynx:       'zap',
        hawksoft:     'upload',
        coi:          'fileText',
        compliance:   'shieldCheck',
        reminders:    'bellRing',
        prospect:     'telescope',
        email:        'mail',
        accounting:   'landmark',
        quickref:     'bookOpen',
        vindecoder:   'carFront',
        calllogger:   'bird',
        endorsement:  'scanText',
        tasksheet:    'clipboardCheck',
        depositsheet: 'wallet',
        decimport:    'filePlus',
        returnedmail: 'mailQuestion',
        broadform:    'badgeHelp',
    };

    /**
     * Get SVG icon HTML by name. Returns inline SVG string.
     */
    function icon(name, size) {
        const svg = ICONS[name] || ICONS.home;
        if (size) {
            return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
        }
        return svg;
    }

    /**
     * Get the icon name for a tool key
     */
    function toolIcon(toolKey) {
        return TOOL_ICONS[toolKey] || 'home';
    }

    // ── Helpers ──

    function _escapeHTML(str) { return Utils.escapeHTML(str); }

    function _relativeTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function _dueDateText(dueDateStr, task) {
        // Use statusLabel from the new Reminders module if available
        if (task && task.statusLabel) return task.statusLabel;
        if (!dueDateStr) return '';
        const parts = dueDateStr.split('-');
        const due = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        due.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((due - today) / 86400000);

        if (diff < -1) return 'Missed';
        if (diff === -1) return 'Yesterday';
        if (diff === 0) return 'Due today';
        if (diff === 1) return 'Tomorrow';
        if (diff <= 7) return `In ${diff} days`;
        return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ── Daily Quotes (rotates by day of year) ──

    const DAILY_QUOTES = [
        { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
        { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
        { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
        { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
        { text: 'The harder you work for something, the greater you\'ll feel when you achieve it.', author: 'Anonymous' },
        { text: 'Don\'t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
        { text: 'Everything you\'ve ever wanted is on the other side of fear.', author: 'George Addair' },
        { text: 'Opportunities don\'t happen. You create them.', author: 'Chris Grosser' },
        { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
        { text: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
        { text: 'Your limitation — it\'s only your imagination.', author: 'Anonymous' },
        { text: 'Push yourself, because no one else is going to do it for you.', author: 'Anonymous' },
        { text: 'Great things never come from comfort zones.', author: 'Anonymous' },
        { text: 'Dream it. Wish it. Do it.', author: 'Anonymous' },
        { text: 'Stay foolish to stay sane.', author: 'Maxime Lagacé' },
        { text: 'Be so good they can\'t ignore you.', author: 'Steve Martin' },
        { text: 'What we think, we become.', author: 'Buddha' },
        { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
        { text: 'A smooth sea never made a skilled sailor.', author: 'Franklin D. Roosevelt' },
        { text: 'If you want to lift yourself up, lift up someone else.', author: 'Booker T. Washington' },
        { text: 'The best revenge is massive success.', author: 'Frank Sinatra' },
        { text: 'I find that the harder I work, the more luck I seem to have.', author: 'Thomas Jefferson' },
        { text: 'Work hard in silence, let your success be your noise.', author: 'Frank Ocean' },
        { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
        { text: 'Don\'t be afraid to give up the good to go for the great.', author: 'John D. Rockefeller' },
        { text: 'Hustle beats talent when talent doesn\'t hustle.', author: 'Ross Simmonds' },
        { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
        { text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
        { text: 'Don\'t let yesterday take up too much of today.', author: 'Will Rogers' },
        { text: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
        { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
        { text: 'If you are working on something exciting, you don\'t have to be pushed.', author: 'Steve Jobs' },
        { text: 'It\'s not whether you get knocked down, it\'s whether you get up.', author: 'Vince Lombardi' },
        { text: 'People who are crazy enough to think they can change the world are the ones who do.', author: 'Rob Siltanen' },
        { text: 'Knowing is not enough; we must apply. Wishing is not enough; we must do.', author: 'Johann Wolfgang von Goethe' },
        { text: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
        { text: 'Creativity is intelligence having fun.', author: 'Albert Einstein' },
        { text: 'The man who has confidence in himself gains the confidence of others.', author: 'Hasidic Proverb' },
        { text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
        { text: 'Life is 10% what happens to us and 90% how we react to it.', author: 'Charles R. Swindoll' },
        { text: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle' },
        { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
        { text: 'Setting goals is the first step in turning the invisible into the visible.', author: 'Tony Robbins' },
        { text: 'Your time is limited — don\'t waste it living someone else\'s life.', author: 'Steve Jobs' },
        { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
        { text: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', author: 'Ralph Waldo Emerson' },
        { text: 'Strive not to be a success, but rather to be of value.', author: 'Albert Einstein' },
        { text: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
        { text: 'I have not failed. I\'ve just found 10,000 ways that won\'t work.', author: 'Thomas Edison' },
        { text: 'The mind is everything. What you think you become.', author: 'Buddha' },
        { text: 'An unexamined life is not worth living.', author: 'Socrates' },
        { text: 'Eighty percent of success is showing up.', author: 'Woody Allen' },
        { text: 'Fall seven times, stand up eight.', author: 'Japanese Proverb' },
        { text: 'When something is important enough, you do it even if the odds are not in your favor.', author: 'Elon Musk' },
        { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
        { text: 'If you look at what you have in life, you\'ll always have more.', author: 'Oprah Winfrey' },
        { text: 'The only person you are destined to become is the person you decide to be.', author: 'Ralph Waldo Emerson' },
        { text: 'Go confidently in the direction of your dreams.', author: 'Henry David Thoreau' },
        { text: 'When you reach the end of your rope, tie a knot in it and hang on.', author: 'Franklin D. Roosevelt' },
        { text: 'There is only one way to avoid criticism: do nothing, say nothing, and be nothing.', author: 'Aristotle' },
    ];

    function _getDailyQuote() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now - start) / 86400000);
        return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
    }

    // ── Weather helpers ──

    const WMO_CODES = {
        0: { label: 'Clear Sky', icon: '☀️' },
        1: { label: 'Mostly Clear', icon: '🌤️' },
        2: { label: 'Partly Cloudy', icon: '⛅' },
        3: { label: 'Overcast', icon: '☁️' },
        45: { label: 'Foggy', icon: '🌫️' },
        48: { label: 'Rime Fog', icon: '🌫️' },
        51: { label: 'Light Drizzle', icon: '🌦️' },
        53: { label: 'Drizzle', icon: '🌦️' },
        55: { label: 'Heavy Drizzle', icon: '🌧️' },
        61: { label: 'Light Rain', icon: '🌦️' },
        63: { label: 'Rain', icon: '🌧️' },
        65: { label: 'Heavy Rain', icon: '🌧️' },
        66: { label: 'Freezing Rain', icon: '🧊' },
        67: { label: 'Heavy Freezing Rain', icon: '🧊' },
        71: { label: 'Light Snow', icon: '🌨️' },
        73: { label: 'Snow', icon: '❄️' },
        75: { label: 'Heavy Snow', icon: '❄️' },
        77: { label: 'Snow Grains', icon: '❄️' },
        80: { label: 'Light Showers', icon: '🌦️' },
        81: { label: 'Showers', icon: '🌧️' },
        82: { label: 'Heavy Showers', icon: '⛈️' },
        85: { label: 'Snow Showers', icon: '🌨️' },
        86: { label: 'Heavy Snow Showers', icon: '🌨️' },
        95: { label: 'Thunderstorm', icon: '⛈️' },
        96: { label: 'Thunderstorm + Hail', icon: '⛈️' },
        99: { label: 'Severe Thunderstorm', icon: '⛈️' },
    };

    function _wmoInfo(code) {
        return WMO_CODES[code] || { label: 'Unknown', icon: '🌡️' };
    }

    function _initLocation() {
        // Restore saved location
        try {
            const saved = localStorage.getItem(WEATHER_LOCATION_KEY);
            if (saved) _weatherLocation = JSON.parse(saved);
        } catch (e) { /* use default */ }

        // Try browser geolocation (non-blocking)
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = +pos.coords.latitude.toFixed(2);
                    const lon = +pos.coords.longitude.toFixed(2);
                    // Only update if location changed significantly
                    if (Math.abs(lat - _weatherLocation.lat) > 0.05 || Math.abs(lon - _weatherLocation.lon) > 0.05) {
                        _weatherLocation.lat = lat;
                        _weatherLocation.lon = lon;
                        // Reverse geocode via Open-Meteo geocoding (free, no key)
                        fetch(`https://geocoding-api.open-meteo.com/v1/search?latitude=${lat}&longitude=${lon}&count=1&format=json`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => {
                                if (data && data.results && data.results[0]) {
                                    const r = data.results[0];
                                    _weatherLocation.name = r.admin1 ? `${r.name}, ${r.admin1}` : r.name;
                                }
                                try { localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify(_weatherLocation)); } catch (e) { /* ignore */ }
                                // Invalidate weather cache and re-fetch
                                _weatherCache = null;
                                try { localStorage.removeItem(WEATHER_CACHE_KEY); } catch (e) { /* ignore */ }
                                _fetchWeather().then(() => renderWeatherWidget());
                            }).catch(() => {
                                try { localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify(_weatherLocation)); } catch (e) { /* ignore */ }
                                _weatherCache = null;
                                _fetchWeather().then(() => renderWeatherWidget());
                            });
                    }
                },
                () => { /* denied or unavailable — use saved/fallback */ },
                { timeout: 5000, maximumAge: 600000 }
            );
        }
    }

    async function _fetchWeather() {
        // Check cache first
        try {
            const raw = localStorage.getItem(WEATHER_CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL) {
                    _weatherCache = cached;
                    return cached;
                }
            }
        } catch (e) { /* proceed */ }

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${_weatherLocation.lat}&longitude=${_weatherLocation.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=3`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) throw new Error('Weather API ' + res.status);
            const data = await res.json();
            data.fetchedAt = Date.now();
            _weatherCache = data;
            try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
            return data;
        } catch (e) {
            console.log('[DashboardWidgets] Weather fetch failed:', e.message);
            return _weatherCache; // return stale cache if available
        }
    }

    // ── Render: Weather Widget ──

    function _formatSunTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function renderWeatherWidget() {
        const container = document.getElementById('widgetWeather');
        if (!container) return;

        if (!_weatherCache) {
            container.innerHTML = `
                <div class="weather-widget-inner">
                    <div class="weather-loading">Loading weather...</div>
                </div>`;
            _fetchWeather().then(() => renderWeatherWidget());
            return;
        }

        const w = _weatherCache;
        const current = w.current || {};
        const daily = w.daily || {};
        const temp = Math.round(current.temperature_2m || 0);
        const feelsLike = Math.round(current.apparent_temperature || 0);
        const code = current.weather_code ?? 0;
        const info = _wmoInfo(code);
        const wind = Math.round(current.wind_speed_10m || 0);
        const humidity = current.relative_humidity_2m || 0;

        // Today's high/low
        const todayHi = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : null;
        const todayLo = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : null;
        const hiLoHtml = (todayHi !== null && todayLo !== null)
            ? `<span class="weather-hilo">H:${todayHi}° L:${todayLo}°</span>`
            : '';

        // Sunrise/sunset
        const sunrise = daily.sunrise ? _formatSunTime(daily.sunrise[0]) : '';
        const sunset = daily.sunset ? _formatSunTime(daily.sunset[0]) : '';
        const sunHtml = (sunrise && sunset)
            ? `<div class="weather-sun-row">${icon('star', 12)} ${sunrise} &nbsp; ${icon('moon', 12)} ${sunset}</div>`
            : '';

        // Today's precip chance
        const todayPrecip = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 0;
        const precipHtml = todayPrecip > 10
            ? `<span class="weather-precip-today">${todayPrecip}% chance of rain</span>`
            : '';

        // 2-day forecast (tomorrow + day after)
        let forecastHtml = '';
        if (daily.time && daily.time.length > 1) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            forecastHtml = '<div class="weather-forecast">';
            for (let i = 1; i < Math.min(daily.time.length, 3); i++) {
                const d = new Date(daily.time[i] + 'T12:00:00');
                const dayName = i === 1 ? 'Tomorrow' : dayNames[d.getDay()];
                const hi = Math.round(daily.temperature_2m_max[i] || 0);
                const lo = Math.round(daily.temperature_2m_min[i] || 0);
                const fInfo = _wmoInfo(daily.weather_code[i]);
                const precip = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0;
                forecastHtml += `<div class="forecast-day">
                    <span class="forecast-name">${dayName}</span>
                    <span class="forecast-icon">${fInfo.icon}</span>
                    <span class="forecast-temps">${hi}°<span class="forecast-lo">/${lo}°</span></span>
                    ${precip > 20 ? `<span class="forecast-rain">${precip}%</span>` : ''}
                </div>`;
            }
            forecastHtml += '</div>';
        }

        container.innerHTML = `
            <div class="weather-widget-inner">
                <div class="weather-current">
                    <div class="weather-icon-big">${info.icon}</div>
                    <div class="weather-temp-group">
                        <div class="weather-temp">${temp}°F ${hiLoHtml}</div>
                        <div class="weather-desc">${info.label}</div>
                        <div class="weather-detail">Feels ${feelsLike}° · Wind ${wind} mph · ${humidity}%</div>
                        ${precipHtml}
                    </div>
                </div>
                ${sunHtml}
                ${forecastHtml}
                <div class="weather-bottom">
                    <div class="weather-location-line">${_escapeHTML(_weatherLocation.name)}</div>
                    <div class="daily-quote-section">
                        <div class="daily-quote-text">"${_escapeHTML(_getDailyQuote().text)}"</div>
                        <div class="daily-quote-author">— ${_escapeHTML(_getDailyQuote().author)}</div>
                    </div>
                </div>
            </div>`;
    }

    // ── Render: Reminders Widget ──

    function renderRemindersWidget() {
        const container = document.getElementById('widgetReminders');
        if (!container) return;

        const hasModule = typeof Reminders !== 'undefined' && Reminders.getCounts;
        const counts = hasModule ? Reminders.getCounts() : { total: 0, overdue: 0, dueToday: 0, dueSoon: 0, completed: 0, upcoming: 0, snoozed: 0 };

        // Get upcoming tasks — compact view, top 5 only
        let tasks = [];
        if (hasModule && Reminders.getUpcomingTasks) {
            tasks = Reminders.getUpcomingTasks(5);
        }

        // Weekly summary
        let weeklySummaryHtml = '';
        if (hasModule && Reminders.getWeeklySummary) {
            const ws = Reminders.getWeeklySummary();
            if (ws.total > 0) {
                weeklySummaryHtml = `<div class="reminder-weekly-summary">📊 ${ws.done}/${ws.total} done this week</div>`;
            }
        }

        const snoozedPill = counts.snoozed ? `
                <div class="reminder-stat-pill stat-pill-snoozed">
                    <span class="stat-count">${counts.snoozed}</span>
                    <span class="stat-label">Snoozed</span>
                </div>` : '';

        const statsHtml = `
            <div class="reminder-stats">
                <div class="reminder-stat-pill stat-pill-overdue">
                    <span class="stat-count">${counts.overdue}</span>
                    <span class="stat-label">Missed</span>
                </div>
                <div class="reminder-stat-pill stat-pill-today">
                    <span class="stat-count">${counts.dueToday}</span>
                    <span class="stat-label">Today</span>
                </div>
                <div class="reminder-stat-pill stat-pill-soon">
                    <span class="stat-count">${counts.dueSoon}</span>
                    <span class="stat-label">Soon</span>
                </div>${snoozedPill}
                <div class="reminder-stat-pill stat-pill-completed">
                    <span class="stat-count">${counts.completed}</span>
                    <span class="stat-label">Done</span>
                </div>
            </div>
            ${weeklySummaryHtml}`;

        let taskListHtml;
        if (tasks.length === 0) {
            taskListHtml = `
                <div class="widget-empty">
                    <div class="widget-empty-icon">${icon('sparkles', 32)}</div>
                    <div class="widget-empty-text">No upcoming reminders — you're all caught up!</div>
                </div>`;
        } else {
            taskListHtml = `<div class="reminder-task-list">${tasks.map(t => {
                const priorityClass = t.priority === 'high' ? 'priority-high' : t.priority === 'low' ? 'priority-low' : 'priority-normal';
                const dueText = _dueDateText(t.dueDate, t);
                const isOverdue = t.status === 'overdue';
                const isSnoozed = t.status === 'snoozed';
                const isCompleted = t.status === 'completed';
                const hasNotes = t.notes && t.notes.trim().length > 0;
                const catBadge = t.category ? `<span class="reminder-tag reminder-tag-cat">${_escapeHTML(t.category)}</span>` : '';
                const freqLabel = t.frequency === 'weekdays' ? 'Mon\u2013Fri' : (t.frequency || 'weekly');
                const freqBadge = `<span class="reminder-tag reminder-tag-freq">${_escapeHTML(freqLabel)}</span>`;
                const notesToggle = hasNotes ? `<button class="reminder-notes-toggle" onclick="event.stopPropagation(); DashboardWidgets.toggleNotes('${t.id}')" title="Show notes"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>` : '';
                const notesContent = hasNotes ? `<div class="reminder-task-notes" id="rem-notes-${t.id}" style="display:none;"><div class="reminder-task-notes-inner">${_escapeHTML(t.notes)}</div></div>` : '';
                return `<div class="reminder-task-row-wrap" data-task-id="${t.id}">
                    <div class="reminder-task-row">
                        <div class="reminder-task-check ${isCompleted ? 'checked' : ''}" onclick="event.stopPropagation(); DashboardWidgets.toggleTask('${t.id}')"></div>
                        <div class="reminder-task-priority ${priorityClass}"></div>
                        <div class="reminder-task-info">
                            <div class="reminder-task-title">${_escapeHTML(t.title)}${notesToggle}</div>
                            <div class="reminder-task-tags">${catBadge}${freqBadge}</div>
                        </div>
                        <div class="reminder-task-due ${isOverdue ? 'overdue' : isSnoozed ? 'snoozed' : ''}">${_escapeHTML(dueText)}</div>
                    </div>
                    ${notesContent}
                </div>`;
            }).join('')}</div>`;
        }

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('bell', 16)} Reminders</div>
                <button class="widget-action" onclick="App.navigateTo('reminders')">View All →</button>
            </div>
            ${statsHtml}
            ${taskListHtml}`;
    }

    // ── Render: Recent Clients Widget ──

    function renderClientsWidget() {
        const container = document.getElementById('widgetDrafts');
        if (!container) return;

        let clients = [];
        let totalClients = 0;
        try {
            const raw = localStorage.getItem('altech_client_history');
            if (raw) {
                const allClients = JSON.parse(raw) || [];
                totalClients = allClients.length;
                clients = allClients.slice(0, 5); // already sorted newest-first
            }
        } catch (e) { /* ignore */ }

        let listHtml;
        if (clients.length === 0) {
            listHtml = `
                <div class="widget-empty">
                    <div class="widget-empty-icon">${icon('user', 32)}</div>
                    <div class="widget-empty-text">No saved clients yet</div>
                    <div class="widget-empty-sub">Complete a quote to see clients here</div>
                </div>`;
        } else {
            listHtml = `<div class="client-list">${clients.map(c => {
                const timeText = _relativeTime(c.savedAt);
                const qType = (c.data && c.data.qType || '').toLowerCase();
                const typeIcon = qType === 'home' ? icon('home', 14) : qType === 'auto' ? icon('car', 14) : qType === 'both' ? icon('home', 14) + icon('car', 14) : icon('user', 14);
                return `<div class="client-row" onclick="App.loadClientFromHistory('${c.id}'); App.navigateTo('quoting');">
                    <div class="client-type-icon">${typeIcon}</div>
                    <div class="client-info">
                        <div class="client-name">${_escapeHTML(c.name || 'Unnamed Client')}</div>
                        <div class="client-summary">${_escapeHTML(c.summary || '')}</div>
                    </div>
                    <div class="client-time">${_escapeHTML(timeText)}</div>
                </div>`;
            }).join('')}</div>`;
        }

        const countLabel = totalClients > 0 ? `<span class="client-count-badge">${totalClients}</span>` : '';

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('user', 16)} Recent Clients ${countLabel}</div>
                <button class="widget-action" onclick="App.navigateTo('quoting')">All Clients →</button>
            </div>
            ${listHtml}`;
    }

    // ── Render: CGL Compliance Widget ──

    function renderComplianceWidget() {
        const container = document.getElementById('widgetCompliance');
        if (!container) return;

        // Don't show compliance data to unauthenticated users
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) {
            container.innerHTML = '<div class="widget-empty"><p>Sign in to view compliance</p></div>';
            return;
        }

        let warning = 0, critical = 0, totalPolicies = 0, okCount = 0;
        const flaggedPolicies = []; // collect policies needing attention
        try {
            const raw = localStorage.getItem('altech_cgl_cache');
            if (raw) {
                const cached = JSON.parse(raw);
                const allPolicies = cached.policies || [];
                let verified = {}, dismissed = {}, snoozed = {};
                let notifyTypes = ['cgl', 'bond', 'pkg', 'bop', 'commercial'];
                let hiddenTypes = [];
                const stateRaw = localStorage.getItem('altech_cgl_state');
                if (stateRaw) {
                    const st = JSON.parse(stateRaw);
                    verified = st.verifiedPolicies || {};
                    dismissed = st.dismissedPolicies || {};
                    snoozed = st.snoozedPolicies || {};
                    if (st.notifyTypes) notifyTypes = st.notifyTypes;
                    if (st.hiddenTypes) hiddenTypes = st.hiddenTypes;
                }
                const _isSnoozeActive = (pn) => {
                    const s = snoozed[pn];
                    return s ? new Date() < new Date(s.snoozedUntil) : false;
                };
                const _isHidden = (pn) => !!verified[pn] || !!dismissed[pn] || _isSnoozeActive(pn);
                // Filter out hidden types AND verified/dismissed/snoozed to match CGL dashboard
                const policies = allPolicies.filter(p => !hiddenTypes.includes(p.policyType || 'cgl') && !_isHidden(p.policyNumber));
                totalPolicies = policies.length;
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                policies.forEach(p => {
                    if (!p.expirationDate) return;
                    const exp = new Date(p.expirationDate);
                    exp.setHours(0, 0, 0, 0);
                    const days = Math.round((exp - now) / 86400000);
                    const pType = p.policyType || 'cgl';
                    if (days <= 5 && notifyTypes.includes(pType)) {
                        critical++;
                        flaggedPolicies.push({ ...p, days, severity: 'critical' });
                    } else if (days <= 30 && notifyTypes.includes(pType)) {
                        warning++;
                        flaggedPolicies.push({ ...p, days, severity: 'warning' });
                    } else if (notifyTypes.includes(pType)) {
                        okCount++;
                    }
                });
                // Sort critical first, then by days ascending
                flaggedPolicies.sort((a, b) => {
                    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
                    return a.days - b.days;
                });
            }
        } catch (e) { /* ignore */ }

        let severityClass;
        if (critical > 0) {
            severityClass = 'severity-critical';
        } else if (warning > 0) {
            severityClass = 'severity-warning';
        } else {
            severityClass = 'severity-ok';
        }

        // Apply severity class to the widget
        container.className = container.className.replace(/severity-\w+/g, '').trim();
        container.classList.add(severityClass);

        // Stat pills (like reminders widget)
        const statPillsHtml = `<div class="compliance-stats">
            <div class="compliance-stat-pill ${critical > 0 ? 'stat-critical' : ''}">
                <span class="stat-count">${critical}</span>
                <span class="stat-label">Critical</span>
            </div>
            <div class="compliance-stat-pill ${warning > 0 ? 'stat-warning' : ''}">
                <span class="stat-count">${warning}</span>
                <span class="stat-label">Warning</span>
            </div>
            <div class="compliance-stat-pill stat-ok">
                <span class="stat-count">${okCount}</span>
                <span class="stat-label">Current</span>
            </div>
            <div class="compliance-stat-pill stat-total">
                <span class="stat-count">${totalPolicies}</span>
                <span class="stat-label">Total</span>
            </div>
        </div>`;

        // Build policy list HTML — compact view, top 5 only
        let policyListHtml = '';
        const displayPolicies = flaggedPolicies.slice(0, 5);
        const moreCount = flaggedPolicies.length - displayPolicies.length;
        if (displayPolicies.length > 0) {
            const rows = displayPolicies.map(p => {
                const rawName = _escapeHTML(p.clientName || p.businessName || p.insuredName || p.namedInsured || 'Unknown Insured');
                const hsId = p.hawksoftId || p.clientNumber;
                let nameHtml;
                if (hsId) {
                    const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
                    const href = isMobile
                        ? `https://agents.hawksoft.app/client/${encodeURIComponent(hsId)}`
                        : `hs://${encodeURIComponent(hsId)}`;
                    const title = isMobile ? 'Open in HawkSoft Agent Portal' : 'Open in HawkSoft';
                    nameHtml = `<a href="${href}" class="compliance-policy-link" title="${title}" target="_blank" rel="noopener">${rawName}</a>`;
                } else {
                    nameHtml = rawName;
                }
                const num = _escapeHTML(p.policyNumber || '—');
                const expDate = p.expirationDate ? new Date(p.expirationDate) : null;
                const expText = expDate ? expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                const daysText = p.days <= 0 ? 'Expired' : `${p.days}d left`;
                return `<div class="compliance-policy-row">
                    <div class="compliance-policy-severity ${p.severity}"></div>
                    <div class="compliance-policy-info">
                        <div class="compliance-policy-name">${nameHtml}</div>
                        <div class="compliance-policy-number">${num} · Exp ${_escapeHTML(expText)}</div>
                    </div>
                    <div class="compliance-policy-exp ${p.severity}">${_escapeHTML(daysText)}</div>
                </div>`;
            }).join('');
            const moreHtml = moreCount > 0 ? `<div class="compliance-policy-more"><a href="#compliance" onclick="event.preventDefault(); App.navigateTo('compliance')">+${moreCount} more</a></div>` : '';
            policyListHtml = `<div class="compliance-policy-list">${rows}</div>${moreHtml}`;
        } else if (totalPolicies === 0) {
            policyListHtml = `<div class="widget-empty">
                <div class="widget-empty-icon">${icon('shieldCheck', 32)}</div>
                <div class="widget-empty-text">No compliance data yet</div>
                <div class="widget-empty-sub">Sign in to sync CGL policies from HawkSoft</div>
            </div>`;
        } else {
            policyListHtml = `<div class="compliance-all-clear">
                ${icon('checkCircle', 20)}
                <span>All ${totalPolicies} policies are current — no expirations within 30 days</span>
            </div>`;
        }

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('shieldCheck', 16)} CGL Compliance</div>
                <button class="widget-action" onclick="App.navigateTo('compliance')">Full Dashboard →</button>
            </div>
            ${statPillsHtml}
            ${policyListHtml}`;
    }

    // ── Background CGL Compliance Fetch ──
    // Silently refreshes compliance cache so the widget (and full dashboard) stay current.
    // Only runs on production (HawkSoft API unreachable on localhost).

    async function _backgroundComplianceFetch() {
        if (_complianceBgFetching) return;
        if (typeof Auth === 'undefined' || !Auth.isSignedIn) return;
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocal) return;

        // Check cache age — skip if fresh enough
        try {
            const raw = localStorage.getItem('altech_cgl_cache');
            if (raw) {
                const cached = JSON.parse(raw);
                const age = Date.now() - (cached.cachedAt || 0);
                if (age < COMPLIANCE_BG_FETCH_INTERVAL) {
                    console.log('[DashboardWidgets] CGL cache fresh (' + Math.round(age / 60000) + 'm) — skip bg fetch');
                    return;
                }
            }
        } catch (e) { /* proceed with fetch */ }

        _complianceBgFetching = true;
        console.log('[DashboardWidgets] CGL background refresh starting...');
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 65000);
            const res = await fetch('/api/compliance', { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) throw new Error('API ' + res.status);

            const data = await res.json();
            if (data?.policies?.length > 0) {
                const cacheObj = {
                    ...data,
                    cachedAt: Date.now(),
                    last_synced_time: new Date().toISOString()
                };
                try { localStorage.setItem('altech_cgl_cache', JSON.stringify(cacheObj)); } catch (e) {}
                // Update IDB if available (CglIDB is a module-level const in compliance-dashboard.js)
                if (typeof CglIDB !== 'undefined' && CglIDB.set) {
                    CglIDB.set('hawksoft_policy_data', cacheObj).catch(() => {});
                }
                // Re-render widget + badges with fresh data
                renderComplianceWidget();
                updateBadges();
                console.log('[DashboardWidgets] CGL background refresh done — ' + data.policies.length + ' policies');
            }
        } catch (e) {
            console.log('[DashboardWidgets] CGL background refresh failed (silent):', e.message);
        } finally {
            _complianceBgFetching = false;
        }
    }

    // ── Render: Quick Actions Widget ──

    function renderQuickActions() {
        const container = document.getElementById('widgetQuickActions');
        if (!container) return;

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${icon('zap', 16)} Quick Actions</div>
            </div>
            <div class="quick-actions-grid">
                <button class="quick-action-btn" onclick="App.navigateTo('quoting')">
                    ${icon('plus', 22)}
                    <span class="quick-action-label">New Quote</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('intake')">
                    ${icon('scanLine', 22)}
                    <span class="quick-action-label">Scan Policy</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('prospect')">
                    ${icon('search', 22)}
                    <span class="quick-action-label">Prospect</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('qna')">
                    ${icon('messageCircle', 22)}
                    <span class="quick-action-label">Policy Q&A</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('ezlynx')">
                    ${icon('zap', 22)}
                    <span class="quick-action-label">EZLynx</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('hawksoft')">
                    ${icon('upload', 22)}
                    <span class="quick-action-label">HawkSoft</span>
                </button>
                <button class="quick-action-btn" onclick="App.navigateTo('calllogger')">
                    ${icon('phone', 22)}
                    <span class="quick-action-label">Logger</span>
                </button>
            </div>`;
    }

    // ── Render: Quick Launch Strip ──

    function renderQuickLaunch() {
        const container = document.getElementById('widgetQuickLaunch');
        if (!container) return;

        // Tools that are NOT already shown as widgets or quick actions
        const widgetKeys = new Set(['reminders', 'compliance']);
        const quickActionKeys = new Set(['quoting', 'intake', 'prospect', 'qna', 'ezlynx', 'hawksoft', 'calllogger']);
        const toolConfig = (typeof App !== 'undefined' && App.toolConfig) ? App.toolConfig : [];

        const launchTools = toolConfig.filter(t => !t.hidden && !widgetKeys.has(t.key) && !quickActionKeys.has(t.key));

        // Group by category for dividers
        const groups = [];
        let lastCat = null;
        launchTools.forEach(t => {
            if (t.category !== lastCat && groups.length > 0) {
                groups.push({ divider: true });
            }
            lastCat = t.category;
            groups.push(t);
        });

        const itemsHtml = groups.map(item => {
            if (item.divider) return '<div class="quick-launch-divider"></div>';
            const iconName = toolIcon(item.key);
            return `<button class="quick-launch-item" onclick="App.navigateTo('${item.key}')" title="${_escapeHTML(item.title)}">
                ${icon(iconName, 24)}
                <span class="quick-launch-label">${_escapeHTML(item.title)}</span>
            </button>`;
        }).join('');

        container.innerHTML = `
            <div class="widget-header">
                <button class="widget-title quick-launch-toggle" onclick="this.closest('.widget-quick-launch').classList.toggle('is-open')" aria-expanded="false" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;padding:0;color:inherit;font:inherit;width:100%;">
                    ${icon('arrowRight', 16)} More Tools
                    <span class="toggle-chevron" style="margin-left:auto;display:flex;align-items:center;">${icon('chevronRight', 14)}</span>
                </button>
            </div>
            <div class="quick-launch-strip">${itemsHtml}</div>`;
    }

    // ── Sidebar Rendering ──

    function renderSidebar() {
        const sidebar = document.getElementById('appSidebar');
        if (!sidebar) return;

        const toolConfig = (typeof App !== 'undefined' && App.toolConfig) ? App.toolConfig : [];
        const categoryLabels = {
            quoting: 'Quoting',
            export: 'Export',
            docs: 'Documents',
            ops: 'Operations',
            tools: 'Agent Tools',
        };

        // Group tools by category
        const seen = [];
        const groups = {};
        toolConfig.filter(t => !t.hidden && t.key !== 'quickref').forEach(t => {
            const cat = t.category || 'other';
            if (!groups[cat]) { groups[cat] = []; seen.push(cat); }
            groups[cat].push(t);
        });

        const navHtml = seen.map(cat => {
            const label = categoryLabels[cat] || cat;
            const items = groups[cat].map(t => {
                const iconName = toolIcon(t.key);
                const badgeHtml = t.badge ? `<span class="sidebar-badge" id="sidebar-${t.badge}"></span>` : '';
                return `<a class="sidebar-nav-item" data-tool="${t.key}" data-tooltip="${_escapeHTML(t.title)}"
                    href="#${t.key}" onclick="event.preventDefault(); App.navigateTo('${t.key}')">
                    <span class="sidebar-nav-icon">${icon(iconName, 20)}</span>
                    <span class="sidebar-nav-item-label">${_escapeHTML(t.title)}</span>
                    ${badgeHtml}
                </a>`;
            }).join('');
            return `<div class="sidebar-nav-group">
                <div class="sidebar-nav-label">${_escapeHTML(label)}</div>
                ${items}
            </div>`;
        }).join('');

        sidebar.innerHTML = `
            <div class="sidebar-brand">
                <svg class="sidebar-brand-logo" viewBox="10 2 40 36" xmlns="http://www.w3.org/2000/svg" aria-label="Altech"><path d="M30,5 L15,35 L22.5,35 L30,20 L37.5,35 L45,35 L30,5 Z M30,15 L20,35 L40,35 L30,15 Z" fill="currentColor" fill-opacity="0.2"/><path d="M30,5 L15,35 L22.5,35 L30,20 L37.5,35 L45,35 L30,5 Z" fill="currentColor"/><path d="M30,15 L25,25 L35,25 L30,15 Z" fill="currentColor" fill-opacity="0.6"/></svg>
                <div class="sidebar-brand-text">
                    <div class="sidebar-brand-name">Altech</div>
                    <div class="sidebar-brand-sub">Insurance Toolkit</div>
                </div>
            </div>
            <nav class="sidebar-nav">
                <div class="sidebar-nav-group">
                    <a class="sidebar-nav-item active" data-tool="home" data-tooltip="Dashboard"
                        href="#home" onclick="event.preventDefault(); App.goHome()">
                        <span class="sidebar-nav-icon">${icon('layoutDashboard', 20)}</span>
                        <span class="sidebar-nav-item-label">Dashboard</span>
                    </a>
                    <a class="sidebar-nav-item" data-tool="quickref" data-tooltip="Quick Reference"
                        href="#quickref" onclick="event.preventDefault(); App.navigateTo('quickref')">
                        <span class="sidebar-nav-icon">${icon('bookOpen', 20)}</span>
                        <span class="sidebar-nav-item-label">Quick Reference</span>
                    </a>
                </div>
                ${navHtml}
            </nav>
            <div class="sidebar-footer">
                <div class="sidebar-footer-actions">
                    <button class="sidebar-footer-btn" onclick="App.toggleDarkMode()" title="Toggle dark mode" aria-label="Toggle dark mode">
                        ${icon('moon', 18)}
                    </button>
                    <button class="sidebar-footer-btn sidebar-bug-btn" onclick="BugReport.open()" title="Report a bug" aria-label="Report a bug">
                        ${icon('bug', 18)}
                    </button>
                    <button class="sidebar-footer-btn" onclick="Auth.showModal()" title="Account" aria-label="Account">
                        ${icon('user', 18)}
                    </button>
                </div>
                <button class="sidebar-collapse-toggle" onclick="DashboardWidgets.toggleSidebar()">
                    ${icon('chevronLeft', 20)}
                    <span class="sidebar-collapse-label">Collapse</span>
                </button>
            </div>`;
    }

    // ── Header Rendering ──

    function renderHeader() {
        const header = document.getElementById('appHeader');
        if (!header) return;

        // Greeting
        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        let name = '';
        try {
            const user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
            if (user) {
                const rawName = user.displayName || user.email.split('@')[0];
                name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            } else if (typeof Onboarding !== 'undefined') {
                name = Onboarding.getUserName() || '';
                if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
            }
        } catch (e) { /* ignore */ }

        const greetingHtml = name
            ? `<span class="header-greeting">${greeting}, <span class="greeting-name">${_escapeHTML(name)}</span></span>`
            : `<span class="header-greeting">${greeting}</span>`;

        // Reminder count for notification bell
        let urgentCount = 0;
        if (typeof Reminders !== 'undefined' && Reminders.getCounts) {
            const c = Reminders.getCounts();
            urgentCount = c.overdue + c.dueToday;
        }

        const badgeHtml = urgentCount > 0
            ? `<span class="header-notification-badge">${urgentCount}</span>`
            : '<span class="header-notification-badge"></span>';

        header.innerHTML = `
            <div class="header-breadcrumb" id="dashBreadcrumb">
                <button class="mobile-menu-btn" onclick="DashboardWidgets.toggleMobileSidebar()" aria-label="Menu">
                    ${icon('menu', 20)}
                </button>
                <span class="breadcrumb-current">Dashboard</span>
            </div>
            <div class="header-actions">
                ${greetingHtml}
                <button class="header-notification-btn" onclick="App.navigateTo('reminders')" title="Reminders" aria-label="Reminders">
                    ${icon('bell', 18)}
                    ${badgeHtml}
                </button>
            </div>`;
    }

    // ── Mobile Bottom Nav ──

    function renderMobileNav() {
        const nav = document.getElementById('mobileBottomNav');
        if (!nav) return;

        nav.innerHTML = `<div class="mobile-bottom-nav-inner">
            <button class="mobile-nav-item active" onclick="App.goHome()">
                ${icon('home', 22)}
                <span>Home</span>
            </button>
            <button class="mobile-nav-item" onclick="App.navigateTo('quoting')">
                ${icon('home', 22)}
                <span>Quoting</span>
            </button>
            <button class="mobile-nav-item" onclick="App.navigateTo('reminders')">
                ${icon('bell', 22)}
                <span>Reminders</span>
            </button>
            <button class="mobile-nav-item" onclick="App.navigateTo('prospect')">
                ${icon('search', 22)}
                <span>Search</span>
            </button>
            <button class="mobile-nav-item" onclick="DashboardWidgets.toggleMobileSidebar()">
                ${icon('menu', 22)}
                <span>More</span>
            </button>
        </div>`;
    }

    // ── Sidebar State Management ──

    function toggleSidebar() {
        document.body.classList.toggle('sidebar-collapsed');
        // Save preference
        try {
            localStorage.setItem('altech_sidebar_collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '');
        } catch (e) { /* ignore */ }
    }

    function toggleMobileSidebar() {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('active');
    }

    function _closeMobileSidebar() {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    }

    // ── Update active sidebar item ──

    function setActiveSidebarItem(toolKey) {
        const items = document.querySelectorAll('.sidebar-nav-item');
        items.forEach(item => {
            item.classList.toggle('active', item.dataset.tool === toolKey);
        });
    }

    // ── Update breadcrumb ──

    function updateBreadcrumb(toolName, toolTitle) {
        _crumbTool = toolName;
        _crumbTitle = toolTitle;
        const bc = document.getElementById('dashBreadcrumb');
        if (!bc) return;
        const menuBtn = `<button class="mobile-menu-btn" onclick="DashboardWidgets.toggleMobileSidebar()" aria-label="Menu">${icon('menu', 20)}</button>`;

        if (!toolName || toolName === 'home') {
            bc.innerHTML = `${menuBtn}<span class="breadcrumb-current">Dashboard</span>`;
        } else {
            let crumbLabel = _escapeHTML(toolTitle || toolName);
            if (toolName === 'quoting') {
                const first = (document.getElementById('firstName')?.value || '').trim();
                const last = (document.getElementById('lastName')?.value || '').trim();
                const insuredName = [first, last].filter(Boolean).join(' ');
                if (insuredName) crumbLabel += ` \u2014 ${_escapeHTML(insuredName)}`;
            }
            bc.innerHTML = `${menuBtn}<a href="#home" onclick="event.preventDefault(); App.goHome()">Dashboard</a>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-current">${crumbLabel}</span>`;
        }
    }

    function refreshBreadcrumb() {
        if (_crumbTool) updateBreadcrumb(_crumbTool, _crumbTitle);
    }

    // ── Update sidebar badges ──

    function updateBadges() {
        // Reminders badge
        if (typeof Reminders !== 'undefined' && Reminders.getCounts) {
            const counts = Reminders.getCounts();
            const urgent = counts.overdue + counts.dueToday;
            const badge = document.getElementById('sidebar-remindersBadge');
            if (badge) {
                badge.textContent = urgent > 0 ? urgent : '';
            }
        }
        // CGL badge
        const cglBadge = document.getElementById('sidebar-cglBadge');
        if (cglBadge) {
            if (typeof Auth === 'undefined' || !Auth.isSignedIn) { cglBadge.textContent = ''; }
            else try {
                const raw = localStorage.getItem('altech_cgl_cache');
                if (!raw) { cglBadge.textContent = ''; return; }
                const cached = JSON.parse(raw);
                const allPolicies = cached.policies || [];
                let verified = {}, dismissed = {}, snoozed = {};
                let notifyTypes = ['cgl', 'bond', 'pkg', 'bop', 'commercial'];
                let hiddenTypes = [];
                const stateRaw = localStorage.getItem('altech_cgl_state');
                if (stateRaw) {
                    const st = JSON.parse(stateRaw);
                    verified = st.verifiedPolicies || {};
                    dismissed = st.dismissedPolicies || {};
                    snoozed = st.snoozedPolicies || {};
                    if (st.notifyTypes) notifyTypes = st.notifyTypes;
                    if (st.hiddenTypes) hiddenTypes = st.hiddenTypes;
                }
                const _isSnoozeActive = (pn) => {
                    const s = snoozed[pn];
                    return s ? new Date() < new Date(s.snoozedUntil) : false;
                };
                const _isHidden = (pn) => !!verified[pn] || !!dismissed[pn] || _isSnoozeActive(pn);
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                let count = 0;
                allPolicies.forEach(p => {
                    if (hiddenTypes.includes(p.policyType || 'cgl')) return;
                    if (_isHidden(p.policyNumber)) return;
                    if (!p.expirationDate) return;
                    if (!notifyTypes.includes(p.policyType || 'cgl')) return;
                    const exp = new Date(p.expirationDate);
                    exp.setHours(0, 0, 0, 0);
                    const days = Math.round((exp - now) / 86400000);
                    // Only badge on critical (≤5 days), not warnings
                    if (days <= 5) count++;
                });
                cglBadge.textContent = count > 0 ? count : '';
            } catch (e) {
                cglBadge.textContent = '';
            }
        }
    }

    // ── Dashboard Greeting ──

    function renderGreeting() {
        const container = document.getElementById('dashboardGreeting');
        if (!container) return;

        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        let name = '';
        try {
            const user = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
            if (user) {
                const rawName = user.displayName || user.email.split('@')[0];
                name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            } else if (typeof Onboarding !== 'undefined') {
                name = Onboarding.getUserName() || '';
                if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
            }
        } catch (e) { /* ignore */ }

        const nameHtml = name ? `, <span class="greeting-name">${_escapeHTML(name)}</span>` : '';
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        container.innerHTML = `
            <h1>${greeting}${nameHtml}</h1>
            <p>${today} — Here's your overview</p>`;
    }

    // ── Toggle Task from Widget ──

    function toggleTask(taskId) {
        if (typeof Reminders !== 'undefined' && Reminders.toggle) {
            Reminders.toggle(taskId);
            // Re-render the widget after a short delay
            setTimeout(() => {
                renderRemindersWidget();
                updateBadges();
            }, 100);
        }
    }

    // ── Refresh All Widgets ──

    function _updateAdminButton() {
        const actions = document.querySelector('.sidebar-footer-actions');
        if (!actions) return;
        const existing = actions.querySelector('.sidebar-admin-btn');
        const isAdmin = typeof Auth !== 'undefined' && Auth.isAdmin;
        if (isAdmin && !existing) {
            const btn = document.createElement('button');
            btn.className = 'sidebar-footer-btn sidebar-admin-btn';
            btn.onclick = () => App.navigateTo('blindspot');
            btn.title = 'Admin Tools';
            btn.setAttribute('aria-label', 'Admin tools');
            btn.innerHTML = icon('lock', 18);
            const userBtn = actions.querySelector('[title="Account"]');
            actions.insertBefore(btn, userBtn);
        } else if (!isAdmin && existing) {
            existing.remove();
        }
    }

    function refreshAll() {
        try { renderGreeting(); } catch (e) { console.error('[DashboardWidgets] renderGreeting error:', e); }
        try { renderWeatherWidget(); } catch (e) { console.error('[DashboardWidgets] renderWeatherWidget error:', e); }
        try { renderRemindersWidget(); } catch (e) { console.error('[DashboardWidgets] renderRemindersWidget error:', e); }
        try { renderClientsWidget(); } catch (e) { console.error('[DashboardWidgets] renderClientsWidget error:', e); }
        try { renderComplianceWidget(); } catch (e) { console.error('[DashboardWidgets] renderComplianceWidget error:', e); }
        try { renderQuickActions(); } catch (e) { console.error('[DashboardWidgets] renderQuickActions error:', e); }
        try { updateBadges(); } catch (e) { console.error('[DashboardWidgets] updateBadges error:', e); }
        try { renderHeader(); } catch (e) { console.error('[DashboardWidgets] renderHeader error:', e); }
        try { _updateAdminButton(); } catch (e) { console.error('[DashboardWidgets] _updateAdminButton error:', e); }
    }

    // ── Show/Hide Dashboard ──

    function showDashboard() {
        const dv = document.getElementById('dashboardView');
        const pv = document.getElementById('pluginViewport');
        const lp = document.getElementById('landingPage');
        if (dv) dv.style.display = '';
        if (pv) { pv.style.display = 'none'; pv.classList.remove('active'); }
        if (lp) lp.style.display = 'none';
        setActiveSidebarItem('home');
        updateBreadcrumb(null);
        _closeMobileSidebar();
        refreshAll();

        // Start auto-refresh (widgets every 60s, compliance API every hour)
        _stopAutoRefresh();
        _refreshInterval = setInterval(() => {
            if (document.getElementById('dashboardView')?.style.display !== 'none') {
                renderWeatherWidget();
                renderRemindersWidget();
                renderClientsWidget();
                renderComplianceWidget();
                updateBadges();
            }
        }, 60000);
        // Hourly compliance background fetch — fire once now if stale, then every hour
        _backgroundComplianceFetch();
        _complianceBgInterval = setInterval(_backgroundComplianceFetch, COMPLIANCE_BG_FETCH_INTERVAL);
    }

    function hideDashboard(toolKey, toolTitle) {
        const dv = document.getElementById('dashboardView');
        const pv = document.getElementById('pluginViewport');
        const lp = document.getElementById('landingPage');
        if (dv) dv.style.display = 'none';
        if (pv) { pv.style.display = 'block'; pv.classList.add('active'); }
        if (lp) lp.style.display = 'none';
        setActiveSidebarItem(toolKey);
        updateBreadcrumb(toolKey, toolTitle);
        _closeMobileSidebar();

        // Auto-collapse sidebar on plugin open (if screen < 1280px)
        if (window.innerWidth < 1280) {
            document.body.classList.add('sidebar-collapsed');
        }

        _stopAutoRefresh();
    }

    function _stopAutoRefresh() {
        if (_refreshInterval) {
            clearInterval(_refreshInterval);
            _refreshInterval = null;
        }
        if (_complianceBgInterval) {
            clearInterval(_complianceBgInterval);
            _complianceBgInterval = null;
        }
    }

    // ── Init ──

    function init() {
        if (_initialized) return;
        _initialized = true;
        console.log('[DashboardWidgets] init() started');

        // Initialize weather location (geolocation + fallback)
        _initLocation();

        // Restore sidebar collapsed preference
        try {
            const collapsed = localStorage.getItem('altech_sidebar_collapsed');
            if (collapsed === '1') {
                document.body.classList.add('sidebar-collapsed');
            }
        } catch (e) { /* ignore */ }

        // Auto-collapse on medium screens
        if (window.innerWidth >= 1024 && window.innerWidth < 1280) {
            document.body.classList.add('sidebar-collapsed');
        }

        // Each render wrapped in try-catch to prevent cascade failure
        try { renderSidebar(); } catch (e) { console.error('[DashboardWidgets] renderSidebar error:', e); }
        try { renderHeader(); } catch (e) { console.error('[DashboardWidgets] renderHeader error:', e); }
        try { renderMobileNav(); } catch (e) { console.error('[DashboardWidgets] renderMobileNav error:', e); }
        try { refreshAll(); } catch (e) { console.error('[DashboardWidgets] refreshAll error:', e); }

        console.log('[DashboardWidgets] init() completed');
    }

    // ── Public API ──

    /** Toggle collapsible notes for a task in the dashboard widget */
    function toggleNotes(taskId) {
        const el = document.getElementById(`rem-notes-${taskId}`);
        if (!el) return;
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        // Rotate the chevron
        const wrap = el.closest('.reminder-task-row-wrap');
        if (wrap) wrap.classList.toggle('notes-open', !isOpen);
    }

    return {
        init,
        refreshAll,
        showDashboard,
        hideDashboard,
        toggleSidebar,
        toggleMobileSidebar,
        toggleTask,
        toggleNotes,
        setActiveSidebarItem,
        updateBreadcrumb,
        refreshBreadcrumb,
        updateBadges,
        renderHeader,
        icon,
        toolIcon,
        ICONS,
        TOOL_ICONS,
    };
})();
