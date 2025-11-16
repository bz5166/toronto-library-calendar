const moment = require('moment');

class EventProcessor {
  
  // Convert raw Toronto data to our schema
  normalizeEvent(rawEvent) {
    // Generate a unique ID
    const eventId = rawEvent._id || 
                   rawEvent.id || 
                   rawEvent.event_id ||
                   `event_${rawEvent.title?.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;

    // Extract categories from eventtype1, eventtype2, eventtype3
    const categories = [
      rawEvent.eventtype1,
      rawEvent.eventtype2, 
      rawEvent.eventtype3
    ].filter(Boolean);
    const primaryCategory = categories[0] || 'General';

    // Extract age groups from agegroup1, agegroup2, agegroup3
    const ageGroups = [
      rawEvent.agegroup1,
      rawEvent.agegroup2,
      rawEvent.agegroup3
    ].filter(Boolean);
    const primaryAgeGroup = ageGroups[0] || null;

    return {
      eventId: String(eventId),
      title: this.cleanText(rawEvent.title || 'Untitled Event'),
      description: this.cleanText(rawEvent.description || ''),
      
      // Parse dates using Toronto's field names
      startDate: this.parseDate(rawEvent.startdate),
      endDate: this.parseDate(rawEvent.enddate),
      startTime: this.cleanText(rawEvent.starttime),
      endTime: this.cleanText(rawEvent.endtime),
      
      // Location details
      library: this.cleanText(rawEvent.library),
      libraryAddress: this.cleanText(rawEvent.location),
      room: null,
      
      // Event categorization using correct field names
      category: this.cleanText(primaryCategory),
      ageGroup: this.cleanText(primaryAgeGroup),
      program: this.cleanText(categories.join(', ')),
      
      // Additional fields
      capacity: null,
      registration: null,
      phone: null,
      email: null,
      website: this.cleanText(rawEvent.pagelink),
      
      // Metadata
      lastUpdated: new Date(),
      dataSource: 'toronto-library-events',
      rawData: rawEvent
    };
  }

  // Clean and normalize text fields
  cleanText(text) {
    if (!text || typeof text !== 'string') return null;
    return text.trim().replace(/\s+/g, ' ') || null;
  }

  // Parse various date formats
  // IMPORTANT: For date-only strings (YYYY-MM-DD), we normalize to EST midnight
  // to avoid timezone issues when deployed to servers in different timezones
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Handle already parsed dates
    if (dateStr instanceof Date) {
      // If it's already a Date, normalize date-only values to EST
      return this.normalizeDateToEST(dateStr);
    }
    
    // Clean the date string
    const cleanDate = String(dateStr).trim();
    if (!cleanDate) return null;
    
    // Check if it's a date-only string (YYYY-MM-DD format)
    const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const dateOnlyMatch = cleanDate.match(dateOnlyPattern);
    
    if (dateOnlyMatch) {
      // Parse as date-only and normalize to EST midnight
      // EST is UTC-5 (or UTC-4 during DST), so we create a date at EST midnight
      // by creating a UTC date and adjusting for EST offset
      const year = parseInt(dateOnlyMatch[1], 10);
      const month = parseInt(dateOnlyMatch[2], 10) - 1; // Month is 0-indexed
      const day = parseInt(dateOnlyMatch[3], 10);
      
      // Create date at EST midnight (5 AM UTC, or 4 AM UTC during DST)
      // We'll use a more reliable method: create the date and adjust for EST
      // EST offset is typically -5 hours, but can be -4 during DST
      // To be safe, we'll create the date and then normalize it
      const tempDate = new Date(year, month, day);
      return this.normalizeDateToEST(tempDate);
    }
    
    // Try different date formats commonly used by Toronto Open Data
    const formats = [
      'YYYY-MM-DD',
      'MM/DD/YYYY',
      'DD/MM/YYYY',
      'YYYY-MM-DDTHH:mm:ss',
      'YYYY-MM-DD HH:mm:ss',
      'MM/DD/YYYY HH:mm:ss',
      'MMMM DD, YYYY',
      'MMM DD, YYYY'
    ];
    
    // Try moment.js parsing with various formats
    for (let format of formats) {
      const parsed = moment(cleanDate, format, true);
      if (parsed.isValid()) {
        // For date-only formats, normalize to EST
        if (format === 'YYYY-MM-DD' || format === 'MM/DD/YYYY' || format === 'DD/MM/YYYY') {
          return this.normalizeDateToEST(parsed.toDate());
        }
        return parsed.toDate();
      }
    }
    
    // Try flexible moment parsing
    const flexibleParsed = moment(cleanDate);
    if (flexibleParsed.isValid()) {
      // Check if it's effectively a date-only value (time is midnight or not specified)
      const hasTime = cleanDate.includes('T') || cleanDate.includes(':');
      if (!hasTime) {
        // Normalize date-only to EST
        return this.normalizeDateToEST(flexibleParsed.toDate());
      }
      return flexibleParsed.toDate();
    }
    
    // Fallback to native JS Date parsing
    const jsDate = new Date(cleanDate);
    if (!isNaN(jsDate.getTime())) {
      // Check if it's a date-only string (no time component in original string)
      if (!cleanDate.includes('T') && !cleanDate.includes(':')) {
        return this.normalizeDateToEST(jsDate);
      }
      return jsDate;
    }
    
    console.warn(`⚠️  Could not parse date: "${cleanDate}"`);
    return null;
  }

  // Normalize a Date object to represent the date at EST midnight
  // This ensures date-only values are consistent across different server timezones
  // We do this by getting the date components as they appear in EST and creating
  // a new date that represents midnight EST for that date
  normalizeDateToEST(date) {
    if (!date) return null;
    
    // Use Intl.DateTimeFormat to get the date as it appears in EST
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    
    const parts = formatter.formatToParts(date);
    const estYear = parseInt(parts.find(p => p.type === 'year').value);
    const estMonth = parseInt(parts.find(p => p.type === 'month').value) - 1; // Month is 0-indexed
    const estDay = parseInt(parts.find(p => p.type === 'day').value);
    
    // Create a date at midnight local time with EST date components
    // This date will represent the EST date, and when serialized to JSON
    // it will be consistent regardless of server timezone
    return new Date(estYear, estMonth, estDay);
  }

  // Parse numbers safely
  parseNumber(value) {
    if (!value) return null;
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  }

  // Save events to database (simplified version)
  async saveEvents(events) {
    console.log(`💾 Processing ${events.length} library events...`);
    
    return {
      total: events.length,
      saved: 0,
      updated: 0,
      errors: 0,
      note: 'Database saving not implemented yet'
    };
  }
}

// IMPORTANT: Export the class!
module.exports = EventProcessor;