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
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Handle already parsed dates
    if (dateStr instanceof Date) return dateStr;
    
    // Clean the date string
    const cleanDate = String(dateStr).trim();
    if (!cleanDate) return null;
    
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
        return parsed.toDate();
      }
    }
    
    // Try flexible moment parsing
    const flexibleParsed = moment(cleanDate);
    if (flexibleParsed.isValid()) {
      return flexibleParsed.toDate();
    }
    
    // Fallback to native JS Date parsing
    const jsDate = new Date(cleanDate);
    if (!isNaN(jsDate.getTime())) {
      return jsDate;
    }
    
    console.warn(`⚠️  Could not parse date: "${cleanDate}"`);
    return null;
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