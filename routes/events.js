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
    
    res.json({
      success: true,
      events: filteredEvents,  // Return ALL filtered events, not just 50
      total: filteredEvents.length,
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
module.exports = router;