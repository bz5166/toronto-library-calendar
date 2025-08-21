const mongoose = require('mongoose');

const libraryEventSchema = new mongoose.Schema({
  // Original fields from Toronto data
  eventId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  
  // Date and time
  startDate: { type: Date },
  endDate: { type: Date },
  startTime: { type: String },
  endTime: { type: String },
  
  // Location
  library: { type: String },
  libraryAddress: { type: String },
  room: { type: String },
  
  // Event details
  category: { type: String },
  ageGroup: { type: String },
  program: { type: String },
  capacity: { type: Number },
  registration: { type: String }, // Required, Drop-in, etc.
  
  // Contact
  phone: { type: String },
  email: { type: String },
  website: { type: String },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now },
  dataSource: { type: String, default: 'toronto-library-events' },
  
  // Original raw data (for debugging)
  rawData: { type: Object }
});

// Create text index for searching
libraryEventSchema.index({ 
  title: 'text', 
  description: 'text', 
  library: 'text',
  category: 'text'
});

module.exports = mongoose.model('LibraryEvent', libraryEventSchema);