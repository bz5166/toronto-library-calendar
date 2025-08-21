class LocationProcessor {
  
  // Convert raw Toronto location data to normalized format
  normalizeLocation(rawLocation) {
    return {
      id: rawLocation._id || rawLocation.id,
      name: this.cleanText(rawLocation.BranchName), // Updated field name
      address: this.cleanText(rawLocation.Address), // Updated field name
      postalCode: this.cleanText(rawLocation.PostalCode), // Updated field name
      latitude: this.parseCoordinate(rawLocation.Lat), // Updated field name
      longitude: this.parseCoordinate(rawLocation.Long), // Updated field name
      phone: this.cleanText(rawLocation.Telephone), // Updated field name
      website: this.cleanText(rawLocation.Website), // Updated field name
      branchCode: this.cleanText(rawLocation.BranchCode), // Added branch code
      physicalBranch: rawLocation.PhysicalBranch, // Added physical branch flag
      serviceTier: this.cleanText(rawLocation.ServiceTier), // Added service tier
      rawData: rawLocation
    };
  }

  // Clean text fields
  cleanText(text) {
    if (!text || typeof text !== 'string') return null;
    return text.trim().replace(/\s+/g, ' ') || null;
  }

  // Parse coordinate values
  parseCoordinate(coord) {
    if (!coord) return null;
    const num = parseFloat(coord);
    return isNaN(num) ? null : num;
  }

  // Create a lookup map of library name to coordinates
  createLocationLookup(locations) {
    const lookup = {};
    
    locations.forEach(location => {
      const normalized = this.normalizeLocation(location);
      
      // Only include physical branches with valid coordinates
      if (normalized.physicalBranch === 1 && normalized.name && 
          normalized.latitude && normalized.longitude) {
        
        // Create multiple lookup keys for fuzzy matching
        const keys = [
          normalized.name,
          normalized.name.toLowerCase(),
          normalized.name.replace(/library/i, '').trim(),
          normalized.name.replace(/branch/i, '').trim(),
          normalized.name.replace(/public library/i, '').trim(),
          normalized.name.replace(/tpl/i, '').trim(),
          // Add variations without common words
          normalized.name.replace(/\b(library|branch|public|tpl)\b/gi, '').trim()
        ];
        
        const locationData = {
          lat: normalized.latitude,
          lng: normalized.longitude,
          address: normalized.address,
          phone: normalized.phone,
          website: normalized.website,
          branchCode: normalized.branchCode,
          serviceTier: normalized.serviceTier
        };
        
        keys.forEach(key => {
          if (key && key.length > 1) { // Avoid empty or single-char keys
            lookup[key] = locationData;
          }
        });
      }
    });
    
    console.log(`📍 Created location lookup with ${Object.keys(lookup).length} entries`);
    console.log(`🏛️ Physical branches found: ${locations.filter(l => l.PhysicalBranch === 1).length}`);
    
    return lookup;
  }

  // Enhanced fuzzy matching for library names
  findLibraryCoordinates(libraryName, locationLookup) {
    if (!libraryName || !locationLookup) return null;
    
    // Try exact match first
    if (locationLookup[libraryName]) {
      return locationLookup[libraryName];
    }
    
    // Try case-insensitive match
    const lowerName = libraryName.toLowerCase();
    if (locationLookup[lowerName]) {
      return locationLookup[lowerName];
    }
    
    // Try fuzzy matching with various cleaned versions
    const searchTerms = [
      lowerName.replace(/library/i, '').trim(),
      lowerName.replace(/branch/i, '').trim(),
      lowerName.replace(/public/i, '').trim(),
      lowerName.replace(/\s+library.*$/i, '').trim(),
      lowerName.replace(/\b(library|branch|public|tpl)\b/gi, '').trim()
    ];
    
    for (const term of searchTerms) {
      if (term && locationLookup[term]) {
        return locationLookup[term];
      }
      
      // Partial matching - check if any location key contains or is contained by the search term
      const matchingKey = Object.keys(locationLookup).find(key => {
        const lowerKey = key.toLowerCase();
        return (lowerKey.includes(term) || term.includes(lowerKey)) && 
               Math.abs(lowerKey.length - term.length) <= 5; // Similar lengths
      });
      
      if (matchingKey) {
        console.log(`🔍 Fuzzy match: "${libraryName}" -> "${matchingKey}"`);
        return locationLookup[matchingKey];
      }
    }
    
    return null;
  }
}

module.exports = LocationProcessor;