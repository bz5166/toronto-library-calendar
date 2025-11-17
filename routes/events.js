const express = require('express');
const router = express.Router();

// Try to load services, but don't crash if they fail
let TorontoLibraryAPI, EventProcessor, LibraryEvent;

try {
  TorontoLibraryAPI = require('../services/torontoLibraryAPI');
  EventProcessor = require('../services/eventProcessor');
  LibraryEvent = require('../models/LibraryEvent');
} catch (error) {
  console.log('⚠️  Some services not available:', error.message);
}

// Initialize services if available
let libraryAPI, processor;
if (TorontoLibraryAPI && EventProcessor) {
  libraryAPI = new TorontoLibraryAPI();
  processor = new EventProcessor();
}

// GET /filters - Extract from correct field names
router.get('/filters', async (req, res) => {
  try {
    if (!libraryAPI || !processor) {
      return res.json({
        success: false,
        error: 'Services not configured'
      });
    }

    const { events } = await libraryAPI.getAllLibraryEvents();
    const processedEvents = events.map(event => processor.normalizeEvent(event));
    
    // Extract libraries
    const libraries = [...new Set(processedEvents.map(e => e.library).filter(Boolean))].sort();
    
    // Extract categories from eventtype fields
    const allCategories = events.flatMap(event => [
      event.eventtype1,
      event.eventtype2,
      event.eventtype3
    ].filter(Boolean));
    const categories = [...new Set(allCategories)].sort();
    
    // Extract age groups from agegroup fields
    const allAgeGroups = events.flatMap(event => [
      event.agegroup1,
      event.agegroup2,
      event.agegroup3
    ].filter(Boolean));
    const ageGroups = [...new Set(allAgeGroups)].sort();

    console.log(`✅ Real data: ${libraries.length} libraries, ${categories.length} categories, ${ageGroups.length} age groups`);

    res.json({
      success: true,
      filters: {
        libraries,
        categories,
        ageGroups
      }
    });

  } catch (error) {
    console.error('❌ Filters error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /test
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Events routes are working!',
    timestamp: new Date().toISOString(),
    services: {
      api: !!libraryAPI,
      processor: !!processor,
      database: !!LibraryEvent
    }
  });
});

// GET / - Main events endpoint for calendar view
router.get('/', async (req, res) => {
  try {
    console.log('📋 Events API called with query:', req.query);
    
    const { 
      search, 
      library, 
      category, 
      ageGroup,
      month,  // Add month parameter for calendar view
      year    // Add year parameter for calendar view
    } = req.query;

    if (!libraryAPI || !processor) {
      return res.json({
        success: false,
        error: 'Services not properly configured. Try refreshing data.',
        events: []
      });
    }

    // Get all events from Toronto API
    console.log('🔄 Fetching all events for filtering...');
    const { events } = await libraryAPI.getAllLibraryEvents();
    
    // Process all events
    let processedEvents = events.map(event => processor.normalizeEvent(event));
    
    // Apply text and dropdown filters first
    let filteredEvents = processedEvents.filter(event => {
      // Text search
      if (search && search.trim()) {
        const searchTerm = search.toLowerCase();
        const searchableText = [
          event.title,
          event.description,
          event.library,
          event.category
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          return false;
        }
      }

      // Library filter
      if (library && library.trim()) {
        if (!event.library || !event.library.toLowerCase().includes(library.toLowerCase())) {
          return false;
        }
      }

      // Category filter
      if (category && category.trim()) {
        if (!event.category || !event.category.toLowerCase().includes(category.toLowerCase())) {
          return false;
        }
      }

      // Age group filter
      if (ageGroup && ageGroup.trim()) {
        if (!event.ageGroup || !event.ageGroup.toLowerCase().includes(ageGroup.toLowerCase())) {
          return false;
        }
      }

      return true;
    });

    // For calendar view: don't limit to 50, return all filtered events
    // The frontend calendar will only display events for the visible month
    console.log(`✅ Returning ${filteredEvents.length} filtered events from ${processedEvents.length} total`);
    
    // Normalize dates to ensure consistency across timezones
    // Since source data is already in EST, ensure all dates are sent as date-only strings (YYYY-MM-DD)
    // This prevents timezone conversion issues when dates are serialized to JSON
    const normalizedEvents = filteredEvents.map(event => {
      const normalized = { ...event };
      
      // Convert startDate to date-only string (YYYY-MM-DD) to preserve EST date
      if (event.startDate) {
        if (event.startDate instanceof Date) {
          // Extract the date components as they are (source is already in EST)
          const year = event.startDate.getFullYear();
          const month = event.startDate.getMonth() + 1; // getMonth() is 0-indexed
          const day = event.startDate.getDate();
          // Format as YYYY-MM-DD string to preserve the EST date
          normalized.startDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        // If it's already a string, keep it as-is (it's already in EST format)
      }
      
      // Same for endDate
      if (event.endDate) {
        if (event.endDate instanceof Date) {
          const year = event.endDate.getFullYear();
          const month = event.endDate.getMonth() + 1;
          const day = event.endDate.getDate();
          normalized.endDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        // If it's already a string, keep it as-is
      }
      
      return normalized;
    });
    
    res.json({
      success: true,
      events: normalizedEvents,  // Return normalized events
      total: normalizedEvents.length,
      allEvents: processedEvents.length,
      source: 'fresh_api_filtered',
      appliedFilters: { search, library, category, ageGroup }
    });

  } catch (error) {
    console.error('❌ Events API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      events: []
    });
  }
});

// POST /refresh
router.post('/refresh', async (req, res) => {
  try {
    if (!libraryAPI || !processor) {
      return res.json({
        success: false,
        error: 'Services not configured'
      });
    }

    console.log('🔄 Starting refresh...');
    const { events, package: packageInfo } = await libraryAPI.getAllLibraryEvents();
    
    let result = { total: events.length, saved: 0, updated: 0, errors: 0 };
    
    res.json({
      success: true,
      message: 'Library events refreshed successfully!',
      stats: result,
      packageInfo: {
        title: packageInfo.title,
        lastUpdated: packageInfo.metadata_modified
      }
    });

  } catch (error) {
    console.error('❌ Refresh Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Add to your existing routes/events.js

// Try to load the new location processor
let LocationProcessor;
try {
  LocationProcessor = require('../services/locationProcessor');
} catch (error) {
  console.log('⚠️  LocationProcessor not available:', error.message);
}

let locationProcessor;
if (LocationProcessor) {
  locationProcessor = new LocationProcessor();
}

// Replace the locations route in your routes/events.js with this simpler version:

router.get('/locations', async (req, res) => {
  const https = require("https");
  const packageId = "f5aa9b07-da35-45e6-b31f-d6790eb9bd9b";

  try {
    console.log('📍 Fetching library locations using CKAN API...');

    // Promise to retrieve the package
    const getPackage = new Promise((resolve, reject) => {
      https.get(`https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=${packageId}`, (response) => {
        let dataChunks = [];
        response
          .on("data", (chunk) => {
            dataChunks.push(chunk);
          })
          .on("end", () => {
            let data = Buffer.concat(dataChunks);
            resolve(JSON.parse(data.toString())["result"]);
          })
          .on("error", (error) => {
            reject(error);
          });
      });
    });

    // Promise to retrieve data of a datastore resource
    // In the getDatastoreResource function, modify the API call:
    const getDatastoreResource = resource => new Promise((resolve, reject) => {
      // Add limit parameter to get all records
      const apiUrl = `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?id=${resource["id"]}&limit=1000`;
      
      https.get(apiUrl, (response) => {
        let dataChunks = [];
        response
          .on("data", (chunk) => {
            dataChunks.push(chunk);
          })
          .on("end", () => {
            let data = Buffer.concat(dataChunks);
            resolve(JSON.parse(data.toString())["result"]["records"]);
          })
          .on("error", (error) => {
            reject(error);
          });
      });
    });

    // Execute the API calls
    const pkg = await getPackage;
    console.log("✅ Package retrieved:", pkg.title || pkg.name);

    // Get datastore resources
    let datastoreResources = pkg["resources"].filter(r => r.datastore_active);
    console.log(`📊 Found ${datastoreResources.length} datastore resources`);

    if (datastoreResources.length > 0) {
      const records = await getDatastoreResource(datastoreResources[0]);
      console.log(`📍 Retrieved ${records.length} location records`);

      // Process the library location data
      const locationLookup = {};
      let validLocations = 0;

      records.forEach((location, index) => {
        console.log(`Processing record ${index}:`, Object.keys(location));
        
        // Check different possible field names for coordinates and branch names
        const possibleLatFields = ['Lat', 'lat', 'latitude', 'Latitude', 'LATITUDE'];
        const possibleLngFields = ['Long', 'lng', 'longitude', 'Longitude', 'LONGITUDE'];
        const possibleNameFields = ['BranchName', 'Branch Name', 'Name', 'name', 'branch_name'];
        
        let lat, lng, branchName;
        
        // Find the coordinate fields
        for (const field of possibleLatFields) {
          if (location[field] !== undefined && location[field] !== null) {
            lat = parseFloat(location[field]);
            break;
          }
        }
        
        for (const field of possibleLngFields) {
          if (location[field] !== undefined && location[field] !== null) {
            lng = parseFloat(location[field]);
            break;
          }
        }
        
        for (const field of possibleNameFields) {
          if (location[field] && location[field].trim()) {
            branchName = location[field].trim();
            break;
          }
        }

        // Log first few records for debugging
        if (index < 5) {
          console.log(`Record ${index}:`, { branchName, lat, lng, location });
        }

        if (branchName && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          // Create multiple name variations for better matching
          const variations = [
            branchName,
            branchName.toLowerCase(),
            branchName.replace(/\s+(Library|Branch)$/i, '').trim(),
            branchName.replace(/\s+(Public\s+)?Library$/i, '').trim(),
            branchName.replace(/\s+Branch$/i, '').trim(),
          ];

          const locationInfo = {
            lat: lat,
            lng: lng,
            address: location.Address || location.address || '',
            phone: location.Telephone || location.phone || ''
          };

          variations.forEach(variation => {
            if (variation && variation.length > 1) {
              locationLookup[variation] = locationInfo;
              locationLookup[variation.toLowerCase()] = locationInfo;
            }
          });

          validLocations++;
          
          if (index < 10) {
            console.log(`✅ Added: "${branchName}" at (${lat}, ${lng})`);
          }
        }
      });

      console.log(`🎉 SUCCESS: Processed ${validLocations} valid locations`);
      console.log(`📋 Sample keys:`, Object.keys(locationLookup).slice(0, 10));

      res.json({
        success: true,
        locations: locationLookup,
        total: validLocations,
        source: 'toronto-ckan-api',
        packageTitle: pkg.title || pkg.name
      });

    } else {
      throw new Error("No datastore resources found");
    }

  } catch (error) {
    console.error('❌ CKAN API Error:', error.message);
    
    // Fallback to comprehensive static data
    const comprehensiveLibraries = {
      'Toronto Reference Library': { lat: 43.6532, lng: -79.3832 },
      'toronto reference library': { lat: 43.6532, lng: -79.3832 },
      'North York Central Library': { lat: 43.7615, lng: -79.4111 },
      'north york central library': { lat: 43.7615, lng: -79.4111 },
      'Scarborough Civic Centre': { lat: 43.7735, lng: -79.2584 },
      'scarborough civic centre': { lat: 43.7735, lng: -79.2584 },
      'High Park': { lat: 43.6465, lng: -79.4635 },
      'high park': { lat: 43.6465, lng: -79.4635 },
      'Beaches': { lat: 43.6677, lng: -79.2941 },
      'beaches': { lat: 43.6677, lng: -79.2941 },
      'Yorkville': { lat: 43.6708, lng: -79.3925 },
      'yorkville': { lat: 43.6708, lng: -79.3925 },
      'Cedarbrae': { lat: 43.7506, lng: -79.2204 },
      'cedarbrae': { lat: 43.7506, lng: -79.2204 }
    };
        // Add this right before the res.json() in your /locations route
        console.log('🔍 Sample location keys from API:', Object.keys(locationLookup).slice(0, 20));
        console.log('🔍 Looking for: "Toronto Reference Library"');
        console.log('🔍 Found in API:', locationLookup['Toronto Reference Library'] ? 'YES' : 'NO');
        console.log('🔍 Found lowercase:', locationLookup['toronto reference library'] ? 'YES' : 'NO');
    res.json({
      success: true,
      locations: comprehensiveLibraries,
      total: 7,
      fallback: true,
      error: error.message
    });
  }
});

// GET /nearby - Get events near a specific location
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query; // radius in km
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    if (!libraryAPI || !processor) {
      return res.json({
        success: false,
        error: 'Services not properly configured',
        events: []
      });
    }

    // Get all events
    const { events } = await libraryAPI.getAllLibraryEvents();
    let processedEvents = events.map(event => processor.normalizeEvent(event));
    
    // Filter events by distance
    const nearbyEvents = processedEvents.filter(event => {
      if (!event.library) return false;
      
      const libraryCoords = libraryCoordinates[event.library];
      if (!libraryCoords) return false;
      
      const distance = calculateDistance(
        parseFloat(lat), 
        parseFloat(lng), 
        libraryCoords.lat, 
        libraryCoords.lng
      );
      
      return distance <= parseFloat(radius);
    });

    console.log(`📍 Found ${nearbyEvents.length} events within ${radius}km of (${lat}, ${lng})`);

    res.json({
      success: true,
      events: nearbyEvents,
      total: nearbyEvents.length,
      location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      radius: parseFloat(radius)
    });

  } catch (error) {
    console.error('❌ Nearby events error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      events: []
    });
  }
});

// Helper function for distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// GET /new - Get newly updated programs based on lastUpdated field
router.get('/new', async (req, res) => {
  try {
    const { days = 28 } = req.query; // Default to 28 days, but allow 1, 4, 7, 14, 21, 28
    
    // Validate days parameter - only allow specific day values
    const validDays = [1, 4, 7, 14, 21, 28];
    const daysNum = parseInt(days, 10);
    if (!validDays.includes(daysNum)) {
      return res.status(400).json({
        success: false,
        error: `Invalid days parameter. Must be one of: ${validDays.join(', ')}`,
        events: []
      });
    }

    // Calculate the date threshold - normalize to UTC midnight for accurate day-based comparison
    const now = new Date();
    const thresholdDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysNum,
      0, 0, 0, 0
    ));

    console.log(`📅 Fetching programs updated in last ${daysNum} days (since ${thresholdDate.toISOString()})`);

    let events = [];
    let source = 'unknown';

    // Try database first if available
    if (LibraryEvent) {
      try {
        // First, check total count in database
        const totalCount = await LibraryEvent.countDocuments();
        console.log(`📊 Total events in database: ${totalCount}`);
        
        // Check a sample event to see field structure
        if (totalCount > 0) {
          const sampleEvent = await LibraryEvent.findOne().lean();
          console.log(`📋 Sample event fields:`, Object.keys(sampleEvent));
          console.log(`📋 Sample lastUpdated value:`, sampleEvent.lastUpdated);
          console.log(`📋 Sample lastUpdated type:`, typeof sampleEvent.lastUpdated);
          console.log(`📋 Sample rawData exists:`, !!sampleEvent.rawData);
          if (sampleEvent.rawData) {
            console.log(`📋 Sample rawData keys:`, Object.keys(sampleEvent.rawData));
            console.log(`📋 Sample rawData.lastupdated:`, sampleEvent.rawData.lastupdated);
            console.log(`📋 Sample rawData.lastUpdated:`, sampleEvent.rawData.lastUpdated);
          }
        }

        // Query database for events updated in the last N days
        // Fetch all events first, then filter by rawData.lastupdated (from raw table)
        // This ensures we use the correct field from the raw event data
        const allEvents = await LibraryEvent.find({})
        .lean(); // Use lean() for better performance
        
        console.log(`📊 Fetched ${allEvents.length} total events from database`);
        
        // Filter events using rawData.lastupdated (prioritize raw table data)
        let filteredCount = 0;
        let noLastUpdatedCount = 0;
        let invalidDateCount = 0;
        const sampleFiltered = [];
        const sampleExcluded = [];
        
        events = allEvents.filter(event => {
          let lastUpdatedValue = null;
          // Prioritize rawData.lastupdated from the raw table
          if (event.rawData && (event.rawData.lastupdated || event.rawData.lastUpdated)) {
            lastUpdatedValue = event.rawData.lastupdated || event.rawData.lastUpdated;
          } else {
            lastUpdatedValue = event.lastupdated || event.lastUpdated;
          }
          
          if (!lastUpdatedValue) {
            noLastUpdatedCount++;
            return false;
          }
          
          let lastUpdated = null;
          try {
            if (lastUpdatedValue instanceof Date) {
              lastUpdated = new Date(lastUpdatedValue);
            } else if (typeof lastUpdatedValue === 'string') {
              // Parse string date - handle various formats
              lastUpdated = new Date(lastUpdatedValue);
              // Check if date is valid
              if (isNaN(lastUpdated.getTime())) {
                invalidDateCount++;
                if (invalidDateCount <= 3) {
                  console.warn(`⚠️ Invalid date format: ${lastUpdatedValue} for event ${event.eventId || event.title}`);
                }
                return false;
              }
            } else {
              lastUpdated = new Date(lastUpdatedValue);
            }
            
            // Normalize to UTC midnight for accurate day-based comparison
            const lastUpdatedUTC = new Date(Date.UTC(
              lastUpdated.getUTCFullYear(),
              lastUpdated.getUTCMonth(),
              lastUpdated.getUTCDate(),
              0, 0, 0, 0
            ));
            
            const isWithinRange = lastUpdatedUTC >= thresholdDate;
            
            if (isWithinRange) {
              filteredCount++;
              if (sampleFiltered.length < 3) {
                sampleFiltered.push({
                  title: event.title,
                  lastUpdated: lastUpdatedUTC.toISOString(),
                  source: event.rawData?.lastupdated ? 'rawData.lastupdated' : 'event.lastUpdated'
                });
              }
            } else {
              if (sampleExcluded.length < 3) {
                sampleExcluded.push({
                  title: event.title,
                  lastUpdated: lastUpdatedUTC.toISOString(),
                  threshold: thresholdDate.toISOString()
                });
              }
            }
            
            return isWithinRange;
          } catch (error) {
            console.error(`❌ Error parsing date for event ${event.eventId || event.title}:`, error, lastUpdatedValue);
            return false;
          }
        });
        
        console.log(`📊 Filtering results:`);
        console.log(`   - Total events: ${allEvents.length}`);
        console.log(`   - Events within range: ${filteredCount}`);
        console.log(`   - Events without lastUpdated: ${noLastUpdatedCount}`);
        console.log(`   - Events with invalid dates: ${invalidDateCount}`);
        console.log(`   - Threshold date: ${thresholdDate.toISOString()}`);
        if (sampleFiltered.length > 0) {
          console.log(`   - Sample included events:`, sampleFiltered);
        }
        if (sampleExcluded.length > 0) {
          console.log(`   - Sample excluded events:`, sampleExcluded);
        }
        
        // Sort by lastupdated from rawData
        events.sort((a, b) => {
          const aLastUpdated = (a.rawData && (a.rawData.lastupdated || a.rawData.lastUpdated)) || a.lastupdated || a.lastUpdated;
          const bLastUpdated = (b.rawData && (b.rawData.lastupdated || b.rawData.lastUpdated)) || b.lastupdated || b.lastUpdated;
          const aDate = aLastUpdated ? (aLastUpdated instanceof Date ? aLastUpdated : new Date(aLastUpdated)) : new Date(0);
          const bDate = bLastUpdated ? (bLastUpdated instanceof Date ? bLastUpdated : new Date(bLastUpdated)) : new Date(0);
          return bDate - aDate; // Most recent first
        });

        console.log(`✅ Found ${events.length} programs in database updated in last ${daysNum} days`);
        source = 'database';
      } catch (dbError) {
        console.error('❌ Database query error:', dbError);
        // Fall through to API fallback
      }
    }

    // If database is empty or not available, fall back to API
    if (events.length === 0 && libraryAPI && processor) {
      console.log('🔄 Database empty or no results, fetching from API...');
      try {
        const { events: apiEvents } = await libraryAPI.getAllLibraryEvents();
        const processedEvents = apiEvents.map(event => processor.normalizeEvent(event));
        
        // Filter events by lastUpdated - prioritize rawData.lastupdated from raw table
        // The eventProcessor now uses rawEvent.lastupdated if available
        const now = new Date();
        console.log(`📊 Processing ${processedEvents.length} events from API, filtering by threshold: ${thresholdDate.toISOString()}`);
        events = processedEvents.filter(event => {
          // Prioritize rawData.lastupdated from the raw table
          let lastUpdatedValue = null;
          if (event.rawData && (event.rawData.lastupdated || event.rawData.lastUpdated)) {
            lastUpdatedValue = event.rawData.lastupdated || event.rawData.lastUpdated;
          } else {
            lastUpdatedValue = event.lastupdated || event.lastUpdated;
          }
          
          if (lastUpdatedValue) {
            let lastUpdated = null;
            try {
              if (lastUpdatedValue instanceof Date) {
                lastUpdated = new Date(lastUpdatedValue);
              } else if (typeof lastUpdatedValue === 'string') {
                // Parse string date - handle various formats
                lastUpdated = new Date(lastUpdatedValue);
                // Check if date is valid
                if (isNaN(lastUpdated.getTime())) {
                  console.warn(`⚠️ Invalid date format: ${lastUpdatedValue} for event ${event.eventId}`);
                  return false;
                }
              } else {
                lastUpdated = new Date(lastUpdatedValue);
              }
              
              // Normalize to UTC midnight for accurate day-based comparison
              const lastUpdatedUTC = new Date(Date.UTC(
                lastUpdated.getUTCFullYear(),
                lastUpdated.getUTCMonth(),
                lastUpdated.getUTCDate(),
                0, 0, 0, 0
              ));
              
              return lastUpdatedUTC >= thresholdDate;
            } catch (error) {
              console.error(`❌ Error parsing date for event ${event.eventId}:`, error, lastUpdatedValue);
              return false;
            }
          }
          // Fallback: if no lastUpdated, check if startDate is in the future or recent
          if (event.startDate) {
            const startDate = event.startDate instanceof Date 
              ? event.startDate 
              : new Date(event.startDate);
            // Consider events starting within the last N days or in the future as "new"
            const daysDiff = (now - startDate) / (1000 * 60 * 60 * 24);
            return daysDiff <= daysNum || daysDiff < 0; // Future events or recent past
          }
          return false;
        }).sort((a, b) => {
          // Sort by lastUpdated - prioritize rawData.lastupdated
          const aLastUpdated = (a.rawData && (a.rawData.lastupdated || a.rawData.lastUpdated)) || a.lastupdated || a.lastUpdated;
          const bLastUpdated = (b.rawData && (b.rawData.lastupdated || b.rawData.lastUpdated)) || b.lastupdated || b.lastUpdated;
          const aDate = aLastUpdated ? (aLastUpdated instanceof Date ? aLastUpdated : new Date(aLastUpdated)) : 
                        (a.startDate ? (a.startDate instanceof Date ? a.startDate : new Date(a.startDate)) : new Date(0));
          const bDate = bLastUpdated ? (bLastUpdated instanceof Date ? bLastUpdated : new Date(bLastUpdated)) : 
                        (b.startDate ? (b.startDate instanceof Date ? b.startDate : new Date(b.startDate)) : new Date(0));
          return bDate - aDate; // Most recent first
        });

        console.log(`✅ Found ${events.length} programs from API (filtered by date)`);
        console.log(`📊 API filtering: ${processedEvents.length} total events, ${events.length} passed filter for last ${daysNum} days`);
        if (events.length > 0 && events.length < 10) {
          console.log(`📊 Sample filtered events:`, events.slice(0, 3).map(e => ({
            title: e.title,
            lastUpdated: e.rawData?.lastupdated || e.lastUpdated
          })));
        }
        source = 'api';
      } catch (apiError) {
        console.error('❌ API fetch error:', apiError);
      }
    }

    // Normalize dates for consistency
    const normalizedEvents = events.map(event => {
      const normalized = { ...event };
      // Ensure rawData is preserved for frontend filtering
      if (event.rawData) {
        normalized.rawData = event.rawData;
      }
      
      // Convert dates to strings if they're Date objects
      if (event.startDate) {
        if (event.startDate instanceof Date) {
          const year = event.startDate.getFullYear();
          const month = event.startDate.getMonth() + 1;
          const day = event.startDate.getDate();
          normalized.startDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      
      if (event.endDate) {
        if (event.endDate instanceof Date) {
          const year = event.endDate.getFullYear();
          const month = event.endDate.getMonth() + 1;
          const day = event.endDate.getDate();
          normalized.endDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      // Format lastUpdated for display - prioritize lastupdated from rawData (original raw table)
      // Check rawData.lastupdated first, then fall back to event.lastupdated or event.lastUpdated
      let lastUpdatedValue = null;
      if (event.rawData && (event.rawData.lastupdated || event.rawData.lastUpdated)) {
        lastUpdatedValue = event.rawData.lastupdated || event.rawData.lastUpdated;
      } else {
        lastUpdatedValue = event.lastupdated || event.lastUpdated;
      }
      
      if (lastUpdatedValue) {
        if (lastUpdatedValue instanceof Date) {
          normalized.lastUpdated = lastUpdatedValue.toISOString();
          normalized.lastupdated = lastUpdatedValue.toISOString(); // Also include lowercase for frontend
        } else if (typeof lastUpdatedValue === 'string') {
          // Already a string, keep as is
          normalized.lastUpdated = lastUpdatedValue;
          normalized.lastupdated = lastUpdatedValue; // Also include lowercase for frontend
        }
      }
      
      return normalized;
    });

    console.log(`📊 Returning ${normalizedEvents.length} events from ${source} for last ${daysNum} days`);
    console.log(`📊 Threshold was: ${thresholdDate.toISOString()}`);
    if (normalizedEvents.length > 0) {
      const firstEvent = normalizedEvents[0];
      const lastEvent = normalizedEvents[normalizedEvents.length - 1];
      console.log(`📊 First event lastUpdated:`, firstEvent.rawData?.lastupdated || firstEvent.lastupdated || firstEvent.lastUpdated);
      console.log(`📊 Last event lastUpdated:`, lastEvent.rawData?.lastupdated || lastEvent.lastupdated || lastEvent.lastUpdated);
    }

    res.json({
      success: true,
      events: normalizedEvents,
      total: normalizedEvents.length,
      days: daysNum,
      thresholdDate: thresholdDate.toISOString(),
      source: source
    });

  } catch (error) {
    console.error('❌ New programs API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      events: []
    });
  }
});

module.exports = router;