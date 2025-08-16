const https = require("https");

class TorontoLibraryAPI {
  constructor() {
    // Existing library events package
    this.eventsPackageId = "fb343332-03cd-40b9-a1c8-c03a4a85ca1e";
    // New library locations package (from your API code)
    this.locationsPackageId = "f5aa9b07-da35-45e6-b31f-d6790eb9bd9b";
    this.baseURL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
  }

  // Generic method to get any package
  getPackage(packageId) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}/package_show?id=${packageId}`;
      
      https.get(url, (response) => {
        let dataChunks = [];
        
        response
          .on("data", (chunk) => {
            dataChunks.push(chunk);
          })
          .on("end", () => {
            try {
              let data = Buffer.concat(dataChunks);
              const result = JSON.parse(data.toString())["result"];
              console.log(`✅ Package fetched: ${result.title}`);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          })
          .on("error", reject);
      });
    });
  }

  // Your existing datastore method (from your location code)
  getDatastoreResource(resource) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}/datastore_search?resource_id=${resource["id"]}&limit=1000`;
      
      https.get(url, (response) => {
        let dataChunks = [];
        
        response
          .on("data", (chunk) => {
            dataChunks.push(chunk);
          })
          .on("end", () => {
            try {
              let data = Buffer.concat(dataChunks);
              resolve(JSON.parse(data.toString())["result"]["records"]);
            } catch (error) {
              reject(error);
            }
          })
          .on("error", reject);
      });
    });
  }

  // Add this method to your TorontoLibraryAPI class
async getAllLibraryLocations() {
  try {
    console.log('🏛️ Starting library locations fetch...');
    
    const packageId = 'f5aa9b07-da35-45e6-b31f-d6790eb9bd9b'; // Library locations package ID
    const packageInfo = await this.getPackage(packageId);
    
    // Find datastore resources
    const datastoreResources = packageInfo["resources"].filter(r => r.datastore_active);
    
    if (datastoreResources.length === 0) {
      throw new Error("No datastore resources found for library locations");
    }

    console.log(`📦 Found ${datastoreResources.length} location resources`);

    // Get location data
    let allLocations = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      console.log(`📥 Fetching location batch starting at ${offset}...`);
      
      const batchResult = await this.getDatastoreResourceBatch(datastoreResources[0], offset, batchSize);
      
      allLocations = allLocations.concat(batchResult.records);
      
      hasMore = batchResult.records.length === batchSize;
      offset += batchSize;
      
      console.log(`✅ Fetched ${batchResult.records.length} locations (total so far: ${allLocations.length})`);
      
      // Safety check
      if (offset > 5000) {
        console.log('⚠️ Reached safety limit for locations');
        break;
      }
    }
    
    console.log(`🎉 Complete! Fetched ${allLocations.length} total library locations`);
    
    return {
      package: packageInfo,
      locations: allLocations,
      resourceInfo: datastoreResources[0],
      total: allLocations.length
    };
    
  } catch (error) {
    console.error("💥 Error fetching library locations:", error.message);
    throw error;
  }
}
  // Your existing events method (keep as is)
  async getAllLibraryEvents() {
    try {
      const packageInfo = await this.getPackage(this.eventsPackageId);
      const datastoreResources = packageInfo["resources"].filter(r => r.datastore_active);
      
      if (datastoreResources.length === 0) {
        throw new Error("No datastore resources found for events");
      }

      let allEvents = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const batchResult = await this.getDatastoreResourceBatch(datastoreResources[0], offset, batchSize);
        allEvents = allEvents.concat(batchResult.records);
        hasMore = batchResult.records.length === batchSize;
        offset += batchSize;
        if (offset > 10000) break;
      }
      
      return {
        package: packageInfo,
        events: allEvents,
        total: allEvents.length
      };
      
    } catch (error) {
      throw error;
    }
  }

  // Batch method for events (keep existing)
  getDatastoreResourceBatch(resource, offset = 0, limit = 1000) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}/datastore_search?resource_id=${resource["id"]}&limit=${limit}&offset=${offset}`;
      
      https.get(url, (response) => {
        let dataChunks = [];
        
        response
          .on("data", (chunk) => {
            dataChunks.push(chunk);
          })
          .on("end", () => {
            try {
              let data = Buffer.concat(dataChunks);
              const result = JSON.parse(data.toString())["result"];
              resolve({
                records: result.records || [],
                total: result.total || 0
              });
            } catch (error) {
              reject(error);
            }
          })
          .on("error", reject);
      });
    });
  }
}

module.exports = TorontoLibraryAPI;