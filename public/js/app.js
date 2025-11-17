// Helper function to get current date in EST timezone
        function getDateInEST() {
            const now = new Date();
            // Get date components in EST/EDT (America/New_York timezone)
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            });
            const parts = formatter.formatToParts(now);
            const estYear = parseInt(parts.find(p => p.type === 'year').value);
            const estMonth = parseInt(parts.find(p => p.type === 'month').value) - 1; // Month is 0-indexed
            const estDay = parseInt(parts.find(p => p.type === 'day').value);
            // Create a date object with EST date components (at midnight local time)
            return new Date(estYear, estMonth, estDay);
        }
        
        // Global Variables
        let allEvents = [];
        let filteredEvents = [];
        let newProgramsEvents = []; // Store new programs events for filtering
        let currentDate = getDateInEST();
        let map = null;
        let libraryMarkers = [];
        let libraryCoordinates = {};
        let markersLayer; // Layer group for markers
        let currentLocationMarker = null; // Current location marker

        // Add these variables at the top of your script section
        let filteredEventsCache = new Map();
        let lastFilterState = '';
        let userLocationCache = null;

        // Cache for distance calculations
        const distanceCache = new Map();

        // Custom pin icon for libraries
        const pinIcon = L.icon({
            iconUrl: 'data:image/svg+xml;base64,' + btoa(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#dc2626" width="30" height="30">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
            `),
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
        });

        // Custom icon for current location
        const currentLocationIcon = L.icon({
            iconUrl: 'data:image/svg+xml;base64,' + btoa(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4285f4" width="24" height="24">
                    <circle cx="12" cy="12" r="8" fill="#4285f4" stroke="#fff" stroke-width="3"/>
                    <circle cx="12" cy="12" r="3" fill="#fff"/>
                </svg>
            `),
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12]
        });

        // Initialize application
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Page loaded, starting initialization...');
            
            // Debug environment for timezone issues
            debugEnvironment();
            
            setupEventListeners();
            loadFilterOptions();
            loadLibraryCoordinates();
            loadEvents();
            
            // Check for stored location and update status
            checkStoredLocation();
            updateLocationStatus();
        });

        // Generate program page URL from website field in program data
        function getEventPageUrl(event) {
            // Use the website field from the program API data
            if (event.website && event.website.trim()) {
                return event.website.trim();
            }
            
            // Fallback - if no website, return # to indicate no link
            return '#';
        }

        // Check if program has a valid URL
        function hasValidEventUrl(event) {
            return event.website && event.website.trim() && event.website.trim() !== '#';
        }

        // Load library coordinates from API
        async function loadLibraryCoordinates() {
            try {
                console.log('📍 Loading library coordinates...');
                const response = await fetch('/api/events/locations');
                const data = await response.json();
                
                if (data.success) {
                    libraryCoordinates = data.locations;
                    console.log(`✅ Loaded ${Object.keys(libraryCoordinates).length} library locations`);
                } else {
                    console.warn('⚠️ Could not load library coordinates, using fallback data');
                    libraryCoordinates = {
                        'Toronto Reference Library': { lat: 43.6532, lng: -79.3832 },
                        'North York Central Library': { lat: 43.7615, lng: -79.4111 },
                        'Scarborough Civic Centre Branch': { lat: 43.7735, lng: -79.2584 }
                    };
                }
            } catch (error) {
                console.error('Error loading library coordinates:', error);
                libraryCoordinates = {
                    'Toronto Reference Library': { lat: 43.6532, lng: -79.3832 },
                    'North York Central Library': { lat: 43.7615, lng: -79.4111 },
                    'Scarborough Civic Centre Branch': { lat: 43.7735, lng: -79.2584 }
                };
            }
        }

        // Enhanced location detection with better error handling and user feedback
        function findCurrentLocation() {
            const locationBtn = document.getElementById('locationBtn');
            
            if (!navigator.geolocation) {
                showLocationError('Geolocation is not supported by this browser.');
                return;
            }
            
            // Show loading state
            locationBtn.classList.add('loading');
            locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            locationBtn.title = 'Finding location...';
            
            // Request location with better options
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    
                    console.log(`📍 Current location: ${lat}, ${lng} (accuracy: ${accuracy}m)`);
                    
                    // Store user location in localStorage for future use
                    localStorage.setItem('userLocation', JSON.stringify({
                        lat: lat,
                        lng: lng,
                        accuracy: accuracy,
                        timestamp: Date.now()
                    }));
                    
                    // Update map with user location
                    updateMapWithUserLocation(lat, lng, accuracy);
                    
                    // Find and highlight nearest libraries
                    findNearestLibraries(lat, lng);
                    
                    // Reset button state
                    locationBtn.classList.remove('loading');
                    locationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                    locationBtn.title = 'Location found! Click to update';
                    
                    // Show success message
                    showLocationSuccess(`Location found! Accuracy: ~${Math.round(accuracy)}m`);
                    
                },
                function(error) {
                    console.error('❌ Location error:', error);
                    handleLocationError(error);
                    
                    // Reset button state
                    locationBtn.classList.remove('loading');
                    locationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                    locationBtn.title = 'Find my location';
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000, // Increased timeout
                    maximumAge: 300000 // 5 minutes
                }
            );
        }

        // Enhanced nearest libraries function
        function findNearestLibraries(userLat, userLng) {
            const librariesWithDistance = [];
            
            // Calculate distance to each library
            Object.entries(libraryCoordinates).forEach(([name, coords]) => {
                const distance = calculateDistance(userLat, userLng, coords.lat, coords.lng);
                librariesWithDistance.push({
                    name: name,
                    distance: distance,
                    coords: coords
                });
            });
            
            // Sort by distance and get top 5
            const nearestLibraries = librariesWithDistance
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 5);
            
            console.log('📍 Nearest libraries:', nearestLibraries);
            
            // Create popup content with nearest libraries
            let popupContent = '<div><strong>📚 Nearest Libraries:</strong><br>';
            nearestLibraries.forEach((lib, index) => {
                popupContent += `
                    <div style="margin: 5px 0; padding: 3px; border-bottom: 1px solid #eee;">
                        ${index + 1}. <strong>${lib.name}</strong><br>
                        <small>📍 ${lib.distance.toFixed(1)} km away</small>
                    </div>
                `;
            });
            popupContent += '</div>';
            
            // Update current location popup
            if (currentLocationMarker) {
                const popupOptions = createPopupOptions();
                currentLocationMarker.bindPopup(popupContent, popupOptions).openPopup();
            }
        }


        // Optimized distance calculation with caching
        function calculateDistance(lat1, lng1, lat2, lng2) {
            const cacheKey = `${lat1.toFixed(3)},${lng1.toFixed(3)},${lat2.toFixed(3)},${lng2.toFixed(3)}`;
            
            if (distanceCache.has(cacheKey)) {
                return distanceCache.get(cacheKey);
            }
            
            const R = 6371; // Earth's radius in kilometers
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;
            
            // Cache the result
            distanceCache.set(cacheKey, distance);
            
            // Limit cache size
            if (distanceCache.size > 1000) {
                const firstKey = distanceCache.keys().next().value;
                distanceCache.delete(firstKey);
            }
            
            return distance;
        }

        // Setup event listeners
        function setupEventListeners() {
            // Use event delegation for better performance
            document.addEventListener('change', function(e) {
                // Handle checkbox filter changes
                if (e.target.matches('input[type="checkbox"][data-filter-type]')) {
                    filterEvents();
                } else if (e.target.matches('#distanceFilter, #dateFilter')) {
                    filterEvents();
                }
            });
            
            // Use event delegation for buttons
            document.addEventListener('click', function(e) {
                if (e.target.matches('#clearFilters')) {
                    clearFilters();
                } else if (e.target.matches('#clearDateFilter')) {
                    document.getElementById('dateFilter').value = '';
                    filterEvents();
                } else if (e.target.matches('#locationBtn')) {
                    findCurrentLocation();
                } else if (e.target.matches('#prevMonth')) {
                currentDate.setMonth(currentDate.getMonth() - 1);
                renderCalendar();
                } else if (e.target.matches('#nextMonth')) {
                currentDate.setMonth(currentDate.getMonth() + 1);
                renderCalendar();
                } else if (e.target.matches('#todayBtn')) {
                currentDate = getDateInEST();
                renderCalendar();
                } else if (e.target.closest('.view-all-programs-btn')) {
                    // Handle "View All Programs" button click
                    const button = e.target.closest('.view-all-programs-btn');
                    e.stopPropagation();
                    e.preventDefault();
                    const libraryNameAttr = button.getAttribute('data-library-name');
                    if (libraryNameAttr) {
                        // Decode HTML entities
                        const libraryName = libraryNameAttr.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                        viewAllProgramsForLibrary(libraryName);
                    }
                }
            });

            // View toggle
            document.querySelectorAll('input[name="view"]').forEach(input => {
                input.addEventListener('change', function() {
                    if (this.value === 'calendar') {
                        showCalendarView();
                    } else if (this.value === 'map') {
                        showMapView();
                    } else if (this.value === 'new') {
                        showNewProgramsView();
                    }
                });
            });
            
            // Days selector for new programs
            const daysSelector = document.getElementById('daysSelector');
            if (daysSelector) {
                daysSelector.addEventListener('change', function() {
                    loadNewPrograms(parseInt(this.value, 10));
                });
            }
        }

        // Optimized filter events function
        function filterEvents() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const libraries = getSelectedFilterValues('library');
            const categories = getSelectedFilterValues('category');
            const ageGroups = getSelectedFilterValues('ageGroup');
            const selectedDate = document.getElementById('dateFilter').value;
            const distance = document.getElementById('distanceFilter').value;

            // Check if we're in the new programs view
            const isNewProgramsView = document.getElementById('newProgramsContainer') && 
                                      document.getElementById('newProgramsContainer').style.display !== 'none';
            
            // Use new programs events if in new programs view, otherwise use allEvents
            const sourceEvents = isNewProgramsView ? newProgramsEvents : allEvents;

            // Create filter state string for caching (using sorted arrays for consistency)
            const filterState = `${search}|${libraries.sort().join(',')}|${categories.sort().join(',')}|${ageGroups.sort().join(',')}|${selectedDate}|${distance}|${isNewProgramsView ? 'new' : 'all'}`;
            
            // Check cache first (but not for new programs view as it changes with days selector)
            if (!isNewProgramsView && filteredEventsCache.has(filterState) && filterState === lastFilterState) {
                console.log('✅ Using cached filtered results');
                filteredEvents = filteredEventsCache.get(filterState);
                updateEventCount();
                updateStatusBar();
                updateActiveFiltersDisplay();
                renderCalendar();
                updateMapMarkers();
                return;
            }

            // Cache user location to avoid repeated localStorage access
            if (distance && !userLocationCache) {
                const storedLocation = localStorage.getItem('userLocation');
                if (storedLocation) {
                    try {
                        userLocationCache = JSON.parse(storedLocation);
                    } catch (error) {
                        userLocationCache = null;
                    }
                }
            }

            // Use more efficient filtering with early exit
            const filtered = sourceEvents.filter(event => {
                // Early exit for search filter (most expensive)
                if (search) {
                    const searchableText = `${event.title || ''} ${event.description || ''} ${event.library || ''} ${event.category || ''}`.toLowerCase();
                    if (!searchableText.includes(search)) return false;
                }
                
                // Early exit for library filter (multiple selections)
                if (libraries.length > 0 && !libraries.includes(event.library)) return false;
                
                // Early exit for category filter (multiple selections)
                if (categories.length > 0 && !categories.includes(event.category)) return false;
                
                // Early exit for age group filter (multiple selections)
                if (ageGroups.length > 0 && !ageGroups.includes(event.ageGroup)) return false;
                
                // Early exit for date filter
                if (selectedDate) {
                    if (!event.startDate) return false;
                    const eventDate = typeof event.startDate === 'string' 
                        ? event.startDate.split('T')[0] 
                        : new Date(event.startDate).toISOString().split('T')[0];
                    if (eventDate !== selectedDate) return false;
                }

                // Early exit for distance filter
                if (distance) {
                    if (!userLocationCache || !event.library) return false;
                    
                    const libraryCoords = libraryCoordinates[event.library];
                    if (!libraryCoords) return false;
                    
                    const eventDistance = calculateDistance(
                        userLocationCache.lat, 
                        userLocationCache.lng, 
                        libraryCoords.lat, 
                        libraryCoords.lng
                    );
                    
                    if (eventDistance > parseFloat(distance)) return false;
                }

                return true;
            });

            // Update the appropriate events array
            if (isNewProgramsView) {
                // For new programs view, update the display directly
                const daysSelector = document.getElementById('daysSelector');
                const days = daysSelector ? parseInt(daysSelector.value, 10) : 28;
                displayNewPrograms(filtered, days);
                // Update active filters display for new programs view
                updateActiveFiltersDisplay();
            } else {
                // For calendar/map view, update filteredEvents
                filteredEvents = filtered;
                
                // Cache the result
                filteredEventsCache.set(filterState, filteredEvents);
                lastFilterState = filterState;

                // Clear cache if it gets too large
                if (filteredEventsCache.size > 50) {
                    const firstKey = filteredEventsCache.keys().next().value;
                    filteredEventsCache.delete(firstKey);
                }

                updateEventCount();
                updateStatusBar();
                updateActiveFiltersDisplay();
                renderCalendar();
                updateMapMarkers();
            }
        }

        // Load programs from API
        async function loadEvents() {
            try {
                document.getElementById('eventCount').innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Loading programs...';
                
                console.log('🔍 Loading events from:', window.location.origin + '/api/events');
                
                const response = await fetch('/api/events');
                const data = await response.json();
                
                console.log('🔍 API Response:', data);
                
                if (data.success) {
                    allEvents = data.events;
                    filteredEvents = [...allEvents];
                    
                    console.log(`✅ Loaded ${allEvents.length} events`);
                    console.log('🔍 Sample Events:', allEvents.slice(0, 3));
                    
                    updateEventCount();
                    updateStatusBar();
                    loadFilterOptions();
                    renderCalendar();
                    
                    document.getElementById('statusBar').style.display = 'block';
                } else {
                    throw new Error(data.error || 'Failed to load events');
                }
            } catch (error) {
                console.error('❌ Error loading events:', error);
                document.getElementById('eventCount').innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i> Error loading programs';
            }
        }

        // Load filter options
        function loadFilterOptions() {
            // Check if we're in new programs view
            const isNewProgramsView = document.getElementById('newProgramsContainer') && 
                                      document.getElementById('newProgramsContainer').style.display !== 'none';
            
            const sourceEvents = isNewProgramsView ? newProgramsEvents : allEvents;
            
            if (sourceEvents.length === 0) return;

            const libraries = [...new Set(sourceEvents.map(event => event.library).filter(Boolean))].sort();
            const categories = [...new Set(sourceEvents.map(event => event.category).filter(Boolean))].sort();
            const ageGroups = [...new Set(sourceEvents.map(event => event.ageGroup).filter(Boolean))].sort();

            populateFilterGroup('libraryFilterBody', libraries, 'library');
            populateFilterGroup('categoryFilterBody', categories, 'category');
            populateFilterGroup('ageGroupFilterBody', ageGroups, 'ageGroup');
        }

        // Populate filter group with checkboxes and counts
        function populateFilterGroup(containerId, options, filterType) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            // Check if we're in new programs view
            const isNewProgramsView = document.getElementById('newProgramsContainer') && 
                                      document.getElementById('newProgramsContainer').style.display !== 'none';
            const sourceEvents = isNewProgramsView ? newProgramsEvents : allEvents;
            
            container.innerHTML = '';
            
            options.forEach(option => {
                // Count how many events match this option
                const count = sourceEvents.filter(event => {
                    if (filterType === 'library') return event.library === option;
                    if (filterType === 'category') return event.category === option;
                    if (filterType === 'ageGroup') return event.ageGroup === option;
                    return false;
                }).length;
                
                const optionDiv = document.createElement('div');
                optionDiv.className = 'filter-option';
                
                const checkboxId = `${filterType}_${option.replace(/\s+/g, '_')}`;
                
                optionDiv.innerHTML = `
                    <label>
                        <input type="checkbox" id="${checkboxId}" value="${option}" data-filter-type="${filterType}">
                        <span>${option}</span>
                    </label>
                    <span class="filter-count">(${count})</span>
                `;
                
                container.appendChild(optionDiv);
            });
        }
        
        // Get selected values from a filter group
        function getSelectedFilterValues(filterType) {
            const checkboxes = document.querySelectorAll(`input[type="checkbox"][data-filter-type="${filterType}"]:checked`);
            return Array.from(checkboxes).map(cb => cb.value);
        }
        
        // Update the active filters display
        function updateActiveFiltersDisplay() {
            const display = document.getElementById('activeFiltersDisplay');
            if (!display) return;
            
            const libraries = getSelectedFilterValues('library');
            const categories = getSelectedFilterValues('category');
            const ageGroups = getSelectedFilterValues('ageGroup');
            const search = document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '';
            const selectedDate = document.getElementById('dateFilter') ? document.getElementById('dateFilter').value : '';
            const distance = document.getElementById('distanceFilter') ? document.getElementById('distanceFilter').value : '';
            
            // Clear the display
            display.innerHTML = '';
            
            // Check if any filters are selected
            const hasFilters = libraries.length > 0 || categories.length > 0 || ageGroups.length > 0 || 
                              search || selectedDate || distance;
            
            // If no filters are selected, show message
            if (!hasFilters) {
                display.innerHTML = '<small class="text-muted">No filters selected</small>';
                return;
            }
            
            // Add search filter
            if (search) {
                const badge = document.createElement('span');
                badge.className = 'filter-badge';
                badge.innerHTML = `
                    <span class="filter-label">Search:</span>
                    <span class="filter-value">${escapeHtml(search)}</span>
                    <span class="filter-close" data-filter-type="search" title="Remove filter">×</span>
                `;
                display.appendChild(badge);
            }
            
            // Add date filter
            if (selectedDate) {
                const badge = document.createElement('span');
                badge.className = 'filter-badge';
                badge.innerHTML = `
                    <span class="filter-label">Date:</span>
                    <span class="filter-value">${escapeHtml(selectedDate)}</span>
                    <span class="filter-close" data-filter-type="date" title="Remove filter">×</span>
                `;
                display.appendChild(badge);
            }
            
            // Add distance filter
            if (distance) {
                const badge = document.createElement('span');
                badge.className = 'filter-badge';
                badge.innerHTML = `
                    <span class="filter-label">Distance:</span>
                    <span class="filter-value">${escapeHtml(distance)} km</span>
                    <span class="filter-close" data-filter-type="distance" title="Remove filter">×</span>
                `;
                display.appendChild(badge);
            }
            
            // Add library filters
            libraries.forEach(library => {
                const badge = document.createElement('span');
                badge.className = 'filter-badge';
                badge.innerHTML = `
                    <span class="filter-label">Library:</span>
                    <span class="filter-value">${escapeHtml(library)}</span>
                    <span class="filter-close" data-filter-type="library" data-value="${escapeHtml(library)}" title="Remove filter">×</span>
                `;
                display.appendChild(badge);
            });
            
            // Add category filters
            categories.forEach(category => {
                const badge = document.createElement('span');
                badge.className = 'filter-badge';
                badge.innerHTML = `
                    <span class="filter-label">Category:</span>
                    <span class="filter-value">${escapeHtml(category)}</span>
                    <span class="filter-close" data-filter-type="category" data-value="${escapeHtml(category)}" title="Remove filter">×</span>
                `;
                display.appendChild(badge);
            });
            
            // Add age group filters
            ageGroups.forEach(ageGroup => {
                const badge = document.createElement('span');
                badge.className = 'filter-badge';
                badge.innerHTML = `
                    <span class="filter-label">Age:</span>
                    <span class="filter-value">${escapeHtml(ageGroup)}</span>
                    <span class="filter-close" data-filter-type="ageGroup" data-value="${escapeHtml(ageGroup)}" title="Remove filter">×</span>
                `;
                display.appendChild(badge);
            });
            
            // Add click handlers for close buttons
            display.querySelectorAll('.filter-close').forEach(closeBtn => {
                closeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const filterType = this.getAttribute('data-filter-type');
                    const value = this.getAttribute('data-value');
                    
                    // Handle different filter types
                    if (filterType === 'search') {
                        document.getElementById('searchInput').value = '';
                    } else if (filterType === 'date') {
                        document.getElementById('dateFilter').value = '';
                    } else if (filterType === 'distance') {
                        document.getElementById('distanceFilter').value = '';
                    } else {
                        // Handle checkbox filters (library, category, ageGroup)
                        // Need to escape special characters in value for CSS selector
                        const escapedValue = value.replace(/"/g, '\\"').replace(/'/g, "\\'");
                        const checkbox = document.querySelector(`input[type="checkbox"][data-filter-type="${filterType}"][value="${escapedValue}"]`);
                        if (checkbox) {
                            checkbox.checked = false;
                        }
                    }
                    
                    // Apply filters after removing one
                    filterEvents();
                });
            });
        }
        
        // Helper function to escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Clear all filters - Updated to include date filter
        function clearFilters() {
            document.getElementById('searchInput').value = '';
            
            // Uncheck all filter checkboxes
            document.querySelectorAll('input[type="checkbox"][data-filter-type]').forEach(checkbox => {
                checkbox.checked = false;
            });
            
            document.getElementById('dateFilter').value = ''; // Clear date filter too
            document.getElementById('distanceFilter').value = ''; // Clear distance filter too
            
            filterEvents();
            updateActiveFiltersDisplay();
        }

        // Update program count
        function updateEventCount() {
            const total = allEvents.length;
            const showing = filteredEvents.length;
            document.getElementById('eventCount').innerHTML = `
                <i class="fas fa-calendar-check me-1"></i>
                ${showing} of ${total} programs
            `;
        }

        // Update status bar
        function updateStatusBar() {
            const libraries = [...new Set(filteredEvents.map(event => event.library).filter(Boolean))];
            
            document.getElementById('totalEvents').textContent = allEvents.length;
            document.getElementById('filteredEvents').textContent = filteredEvents.length;
            document.getElementById('libraryCount').textContent = libraries.length;
        }

        // View switching functions
        function showCalendarView() {
            document.getElementById('calendarContainer').style.display = 'block';
            document.getElementById('mapContainer').style.display = 'none';
            document.getElementById('newProgramsContainer').style.display = 'none';
            renderCalendar();
        }

        function showMapView() {
            document.getElementById('calendarContainer').style.display = 'none';
            document.getElementById('mapContainer').style.display = 'block';
            document.getElementById('newProgramsContainer').style.display = 'none';
            if (!map) {
                initializeMap();
            }
            updateMapMarkers();
            
            // Automatically request location when switching to map view
            // Check if we already have a stored location
            const storedLocation = localStorage.getItem('userLocation');
            if (storedLocation) {
                try {
                    const location = JSON.parse(storedLocation);
                    const age = Date.now() - location.timestamp;
                    // Use stored location if it's less than 30 minutes old
                    if (age < 30 * 60 * 1000) {
                        console.log('📍 Using stored location for map view');
                        updateMapWithUserLocation(location.lat, location.lng, location.accuracy || 100);
                        userLocationCache = location;
                    } else {
                        // Location is old, request new one
                        console.log('📍 Stored location is old, requesting new location');
                        findCurrentLocation();
                    }
                } catch (error) {
                    console.error('Error parsing stored location:', error);
                    // Request new location if stored one is invalid
                    findCurrentLocation();
                }
            } else {
                // No stored location, request it
                console.log('📍 No stored location, requesting location for map view');
                findCurrentLocation();
            }
        }

        function showNewProgramsView() {
            document.getElementById('calendarContainer').style.display = 'none';
            document.getElementById('mapContainer').style.display = 'none';
            document.getElementById('newProgramsContainer').style.display = 'block';
            
            // Load new programs with default days (28) if not already loaded
            if (newProgramsEvents.length === 0) {
                const daysSelector = document.getElementById('daysSelector');
                const days = daysSelector ? parseInt(daysSelector.value, 10) : 28;
                loadNewPrograms(days);
            } else {
                // If already loaded, just apply current filters
                filterEvents();
            }
        }

        // Load new programs from API
        async function loadNewPrograms(days) {
            const loadingEl = document.getElementById('newProgramsLoading');
            const errorEl = document.getElementById('newProgramsError');
            const listEl = document.getElementById('newProgramsList');
            
            // Show loading, hide error and list
            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            listEl.innerHTML = '';
            
            try {
                console.log(`📅 Loading new programs from last ${days} days...`);
                const response = await fetch(`/api/events/new?days=${days}`);
                const data = await response.json();
                
                if (data.success) {
                    console.log(`✅ Loaded ${data.events.length} new programs from API for last ${days} days`);
                    console.log(`📊 Request was for ${days} days, received ${data.events.length} events`);
                    if (data.events.length > 0) {
                        const sample = data.events[0];
                        console.log(`📊 Sample event structure:`, {
                            title: sample.title,
                            hasRawData: !!sample.rawData,
                            rawDataLastUpdated: sample.rawData?.lastupdated || sample.rawData?.lastUpdated,
                            eventLastUpdated: sample.lastupdated || sample.lastUpdated,
                            allKeys: Object.keys(sample).slice(0, 10)
                        });
                    }
                    // Store the events globally for filtering
                    newProgramsEvents = data.events;
                    console.log(`📊 Stored ${newProgramsEvents.length} events in newProgramsEvents`);
                    // Load filter options based on new programs
                    loadFilterOptionsForNewPrograms();
                    // Apply current filters to the new programs and display them
                    filterEvents();
                } else {
                    throw new Error(data.error || 'Failed to load new programs');
                }
            } catch (error) {
                console.error('❌ Error loading new programs:', error);
                errorEl.textContent = `Error loading new programs: ${error.message}`;
                errorEl.style.display = 'block';
            } finally {
                loadingEl.style.display = 'none';
            }
        }
        
        // Load filter options based on new programs events
        function loadFilterOptionsForNewPrograms() {
            if (newProgramsEvents.length === 0) return;

            const libraries = [...new Set(newProgramsEvents.map(event => event.library).filter(Boolean))].sort();
            const categories = [...new Set(newProgramsEvents.map(event => event.category).filter(Boolean))].sort();
            const ageGroups = [...new Set(newProgramsEvents.map(event => event.ageGroup).filter(Boolean))].sort();

            populateFilterGroup('libraryFilterBody', libraries, 'library');
            populateFilterGroup('categoryFilterBody', categories, 'category');
            populateFilterGroup('ageGroupFilterBody', ageGroups, 'ageGroup');
        }

        // Display new programs in the list
        function displayNewPrograms(events, days) {
            const listEl = document.getElementById('newProgramsList');
            
            if (events.length === 0) {
                // Check if there are any filters applied
                const search = document.getElementById('searchInput').value.toLowerCase();
                const libraries = getSelectedFilterValues('library');
                const categories = getSelectedFilterValues('category');
                const ageGroups = getSelectedFilterValues('ageGroup');
                const selectedDate = document.getElementById('dateFilter').value;
                const distance = document.getElementById('distanceFilter').value;
                
                const hasFilters = search || libraries.length > 0 || categories.length > 0 || 
                                  ageGroups.length > 0 || selectedDate || distance;
                
                if (hasFilters) {
                    listEl.innerHTML = `
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            No programs match your current filters. Try adjusting your search or filter criteria.
                        </div>
                    `;
                } else {
                    listEl.innerHTML = `
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            No programs were created or updated in the last ${days} day${days !== 1 ? 's' : ''}.
                        </div>
                    `;
                }
                return;
            }
            
            listEl.innerHTML = events.map(event => {
                // Format startDate correctly without timezone conversion issues
                // Use the same approach as showEventDetails to ensure consistency
                let startDate = 'Date TBD';
                if (event.startDate) {
                    if (typeof event.startDate === 'string') {
                        // If it's a string like "2024-01-15", parse it correctly
                        const dateStr = event.startDate.split('T')[0]; // Get just the date part
                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                            // Parse as local date to avoid timezone issues
                            const [year, month, day] = dateStr.split('-').map(Number);
                            const date = new Date(year, month - 1, day); // month is 0-indexed
                            startDate = date.toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                            });
                        } else {
                            // Fallback to direct string display
                            startDate = dateStr;
                        }
                    } else if (event.startDate instanceof Date) {
                        startDate = event.startDate.toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                        });
                    }
                }
                
                // Format lastUpdated - use lastupdated column from rawData (original raw table)
                // Check rawData.lastupdated first, then fall back to event.lastupdated or event.lastUpdated
                let lastUpdatedValue = null;
                if (event.rawData && (event.rawData.lastupdated || event.rawData.lastUpdated)) {
                    lastUpdatedValue = event.rawData.lastupdated || event.rawData.lastUpdated;
                } else {
                    lastUpdatedValue = event.lastupdated || event.lastUpdated;
                }
                const lastUpdated = lastUpdatedValue ? new Date(lastUpdatedValue).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric'
                }) : '';
                
                const description = event.description || 'No description available.';
                const truncatedDescription = description.length > 150 
                    ? description.substring(0, 150) + '...' 
                    : description;
                const safeTitle = escapeHtml(event.title || 'Untitled Program');
                const infoTags = [
                    event.library ? `<span class="program-tag"><i class="fas fa-map-marker-alt" aria-hidden="true"></i>${escapeHtml(event.library)}</span>` : '',
                    event.category ? `<span class="program-tag"><i class="fas fa-tag" aria-hidden="true"></i>${escapeHtml(event.category)}</span>` : '',
                    event.ageGroup ? `<span class="program-tag"><i class="fas fa-users" aria-hidden="true"></i>${escapeHtml(event.ageGroup)}</span>` : ''
                ].filter(Boolean).join('');
                const updatedLabel = lastUpdated
                    ? `<span class="program-updated" aria-label="Updated ${lastUpdated}">Updated ${lastUpdated}</span>`
                    : `<span class="program-updated program-updated--new" aria-label="New program">New this period</span>`;
                
                return `
                    <article class="new-program-card" role="button" tabindex="0" aria-label="View details for ${safeTitle}"
                        onclick="showEventDetails('${event.eventId}')"
                        onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); showEventDetails('${event.eventId}'); }">
                        <div class="program-card-header">
                            <h4>${safeTitle}</h4>
                        </div>
                        ${infoTags ? `<div class="program-tag-list">${infoTags}</div>` : ''}
                        <div class="program-updated-row">
                            <i class="fas fa-history" aria-hidden="true"></i>
                            ${updatedLabel}
                        </div>
                        <div class="program-description">${escapeHtml(truncatedDescription)}</div>
                        <div class="program-card-footer">
                            <div class="program-date">
                                <i class="fas fa-calendar" aria-hidden="true"></i>
                                ${startDate}
                            </div>
                            <button class="program-card-btn btn btn-primary btn-sm" type="button"
                                onclick="event.stopPropagation(); showEventDetails('${event.eventId}')">
                                View Details
                            </button>
                        </div>
                    </article>
                `;
            }).join('');
        }

        // Initialize map
        function initializeMap() {
            console.log('🗺️ Initializing map...');
            
            map = L.map('map').setView([43.6532, -79.3832], 11);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            
            // Create layer group for markers
            markersLayer = L.layerGroup().addTo(map);
            
            console.log('✅ Map initialized');
        }

        // Optimized update map markers function
        function updateMapMarkers() {
            if (!map || !markersLayer) return;
            
            // Batch DOM operations
            const fragment = document.createDocumentFragment();
            
            // Clear existing markers
            markersLayer.clearLayers();
            
            const eventsData = getFilteredEvents();
            
            // Pre-process events by library
            const eventsByLibrary = new Map();
            eventsData.forEach(event => {
                if (!event.library) return;
                
                if (!eventsByLibrary.has(event.library)) {
                    eventsByLibrary.set(event.library, []);
                }
                eventsByLibrary.get(event.library).push(event);
            });
            
            // Create markers in batch
            const markers = [];
            eventsByLibrary.forEach((events, libraryName) => {
                const coordinates = getLibraryCoordinates(libraryName);
                if (!coordinates) return;
                
                const marker = createLibraryMarker(coordinates, libraryName, events);
                markers.push(marker);
            });
            
            // Add all markers at once
            markers.forEach(marker => markersLayer.addLayer(marker));
        }

        // Helper function to get library coordinates efficiently
        function getLibraryCoordinates(libraryName) {
            // Use a more efficient lookup
                const searchNames = [
                    libraryName,
                    libraryName.toLowerCase(),
                    libraryName.replace(/library/i, '').trim(),
                    libraryName.replace(/branch/i, '').trim()
                ];
                
                for (const searchName of searchNames) {
                    if (libraryCoordinates[searchName]) {
                    return [
                            libraryCoordinates[searchName].lat,
                            libraryCoordinates[searchName].lng
                        ];
                    }
                }
            return null;
                }
                
        // Helper function to create library marker
        function createLibraryMarker(coordinates, libraryName, events) {
                // Set higher z-index so library markers are clickable above location marker
                const marker = L.marker(coordinates, { 
                    icon: pinIcon,
                    zIndexOffset: 100  // Higher than location marker so it's clickable
                });
                
                const locationData = Object.values(libraryCoordinates).find(loc =>
                    loc.lat === coordinates[0] && loc.lng === coordinates[1]
                );
                
        // Pre-build popup content more efficiently
        const popupContent = buildPopupContent(libraryName, events, locationData);
        
        // Mobile-friendly popup options
        const popupOptions = createPopupOptions();
            
            marker.bindPopup(popupContent, popupOptions);
            
            // Attach event listener when popup opens
            marker.on('popupopen', function() {
                // Use setTimeout to ensure popup DOM is fully rendered
                setTimeout(function() {
                    const popup = marker.getPopup();
                    const popupElement = popup ? popup.getElement() : null;
                    if (popupElement) {
                        const viewAllButton = popupElement.querySelector('.view-all-programs-btn');
                        if (viewAllButton && !viewAllButton.hasAttribute('data-listener-attached')) {
                            viewAllButton.setAttribute('data-listener-attached', 'true');
                            viewAllButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                e.preventDefault();
                                const libraryNameAttr = this.getAttribute('data-library-name');
                                if (libraryNameAttr) {
                                    // Decode HTML entities
                                    const libraryName = libraryNameAttr.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                                    viewAllProgramsForLibrary(libraryName);
                                }
                            });
                        }
                    }
                }, 10);
            });
            
            return marker;
        }

        // Helper function to build popup content
        function buildPopupContent(libraryName, events, locationData) {
            const eventList = events.slice(0, 5).map(event => {
                    const eventUrl = getEventPageUrl(event);
                    const hasUrl = hasValidEventUrl(event);
                    
                return `
                        <div class="popup-event">
                            ${hasUrl ? `<a href="${eventUrl}" target="_blank" class="library-link" onclick="event.stopPropagation()">` : ''}
                            <strong>${event.title}</strong>
                            ${hasUrl ? '</a>' : ''}
                            <br>
                            <small>${event.startDate ? event.startDate.split('T')[0] : 'Date TBD'}</small>
                            <br><button onclick="showEventDetails('${event.eventId}')" class="popup-view-details-btn" style="background: none; border: none; color: #0066cc; padding: 0.25rem 0; margin-top: 0.25rem; font-size: 0.85rem; cursor: pointer; text-decoration: underline; touch-action: manipulation; min-height: 32px;">View Details</button>
                        </div>
                    `;
            }).join('');
            
            // Escape library name for use in JavaScript (using JSON.stringify for proper escaping)
            const escapedLibraryName = JSON.stringify(libraryName);
            
            return `
                <div class="library-popup">
                    <h3>${libraryName}</h3>
                    <p><strong>${events.length} programs</strong></p>
                    ${locationData?.address ? `<p>📍 ${locationData.address}</p>` : ''}
                    ${locationData?.phone ? `<p>📞 ${locationData.phone}</p>` : ''}
                    <div class="event-list">
                        ${eventList}
                        ${events.length > 5 ? `<div class="popup-event">...and ${events.length - 5} more programs</div>` : ''}
                    </div>
                    ${events.length > 5 ? `
                        <div style="margin-top: 10px; text-align: center;">
                            <button class="view-all-programs-btn btn btn-sm btn-primary" 
                                    data-library-name="${libraryName.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}"
                                    style="width: 100%; cursor: pointer;">
                                View All ${events.length} Programs
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        function getResponsivePopupWidth() {
            const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const widthFromViewport = Math.round(viewportWidth * 0.82);
            return Math.min(360, Math.max(220, widthFromViewport));
        }

        function createPopupOptions(overrides = {}) {
            const popupWidth = getResponsivePopupWidth();
            return {
                maxWidth: popupWidth,
                minWidth: Math.min(260, popupWidth),
                className: 'library-popup-wrapper',
                autoPan: true,
                autoPanPadding: [16, 16],
                closeButton: true,
                autoClose: false,
                closeOnClick: false,
                ...overrides
            };
        }

        const updatePopupSizes = debounce(() => {
            if (!map) return;
            const popupWidth = getResponsivePopupWidth();
            map.eachLayer(layer => {
                if (
                    typeof layer.getPopup === 'function' &&
                    typeof layer.isPopupOpen === 'function' &&
                    layer.isPopupOpen()
                ) {
                    const popup = layer.getPopup();
                    if (popup) {
                        popup.options.maxWidth = popupWidth;
                        popup.options.minWidth = Math.min(260, popupWidth);
                        popup.update();
                    }
                }
            });
        }, 150);

        window.addEventListener('resize', updatePopupSizes);

        // Function to view all programs for a specific library (make it globally accessible)
        function viewAllProgramsForLibrary(libraryName) {
            console.log('🔍 viewAllProgramsForLibrary called with:', libraryName);
            // Close any open popups
            if (map) {
                map.closePopup();
            }
            
            // Uncheck all library checkboxes first
            document.querySelectorAll('input[type="checkbox"][data-filter-type="library"]').forEach(checkbox => {
                checkbox.checked = false;
            });
            
            // Find and check the checkbox that matches the library name
            const libraryCheckboxes = document.querySelectorAll('input[type="checkbox"][data-filter-type="library"]');
            const searchName = libraryName.trim();
            let found = false;
            
            for (const checkbox of libraryCheckboxes) {
                const checkboxValue = checkbox.value.trim();
                if (checkboxValue === searchName || checkboxValue.toLowerCase() === searchName.toLowerCase()) {
                    checkbox.checked = true;
                    found = true;
                    break;
                }
            }
            
            // If library filter group is closed, open it
            const libraryToggle = document.getElementById('libraryFilterToggle');
            if (libraryToggle && !libraryToggle.checked) {
                libraryToggle.checked = true;
            }
            
            // Select the calendar radio button
            const calendarRadio = document.getElementById('calendarView');
            if (calendarRadio) {
                calendarRadio.checked = true;
            }
            
            // Show notification
            showFilterNotification(`Showing all programs for ${libraryName}`);
            
            // Switch to calendar view
            showCalendarView();
            
            // Trigger filter to apply the library filter
            filterEvents();
            
            // Scroll to calendar view
            document.getElementById('calendarContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Function to update the library filter badge (deprecated - kept for compatibility)
        function updateLibraryFilterBadge(libraryName) {
            // This function is no longer needed with checkbox filters
            // Kept for compatibility with any remaining code that might call it
        }

        // Function to show filter notification
        function showFilterNotification(message) {
            // Escape HTML to prevent XSS
            const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            
            const notification = document.createElement('div');
            notification.className = 'alert alert-info alert-dismissible fade show position-fixed';
            notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
            notification.innerHTML = `
                <i class="fas fa-filter me-2"></i>
                <strong>Filter Applied:</strong><br>
                ${escapedMessage}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            `;
            
            document.body.appendChild(notification);
            
            // Auto-remove after 4 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.transition = 'opacity 0.3s';
                    notification.style.opacity = '0';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                    }, 300);
                }
            }, 4000);
        }

        // Add this debugging function at the top of your script section
        function debugEnvironment() {
            console.log('🔍 === ENVIRONMENT DEBUG ===');
            console.log('🔍 Current Date:', new Date().toString());
            console.log('🔍 Current Date ISO:', new Date().toISOString());
            console.log('🔍 Timezone Offset:', new Date().getTimezoneOffset());
            console.log('🔍 User Agent:', navigator.userAgent);
            console.log('🔍 Window Location:', window.location.href);
            
            // Test timezone-safe date creation
            const testDate = new Date(Date.UTC(2024, 0, 1)); // January 1, 2024
            console.log('🔍 Test UTC Date (Jan 1, 2024):', testDate.toString());
            console.log('🔍 Test UTC Date ISO:', testDate.toISOString());
            console.log('🔍 Test UTC Month:', testDate.getUTCMonth());
            console.log('🔍 Test UTC Day:', testDate.getUTCDate());
            
            console.log('🔍 === END ENVIRONMENT DEBUG ===');
        }

        // Helper function to get day of week in EST
        function getDayOfWeekInEST(date) {
            // Get the date components as they appear in EST
            const estFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                weekday: 'long'
            });
            const parts = estFormatter.formatToParts(date);
            const weekday = parts.find(p => p.type === 'weekday').value;
            
            // Convert weekday name to day number (0 = Sunday, 6 = Saturday)
            const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return weekdays.indexOf(weekday);
        }
        
        // Optimized calendar rendering with debugging
        function renderCalendar() {
            console.log(' Calendar rendering started');
            
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            console.log('🔍 Calendar Debug:');
            console.log('🔍 - Year:', year);
            console.log('🔍 - Month:', month);
            console.log('🔍 - Current Date Object:', currentDate);
            
            document.getElementById('currentMonth').textContent =
                currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            
            // Build calendar using EST dates
            // Create first day of month in EST
            const firstDayEST = new Date(year, month, 1);
            const firstDayOfWeek = getDayOfWeekInEST(firstDayEST);
            
            // Create last day of month in EST
            const lastDayEST = new Date(year, month + 1, 0);
            
            // Calculate start date (Sunday of the week containing the first day)
            const startDate = new Date(firstDayEST);
            startDate.setDate(startDate.getDate() - firstDayOfWeek);
            
            // Calculate end date (Saturday of the week containing the last day)
            const lastDayOfWeek = getDayOfWeekInEST(lastDayEST);
            const endDate = new Date(lastDayEST);
            endDate.setDate(endDate.getDate() + (6 - lastDayOfWeek));
            
            const firstDay = firstDayEST;
            const lastDay = lastDayEST;
            
            console.log('🔍 - First Day:', firstDay);
            console.log(' - Last Day:', lastDay);
            console.log('🔍 - Start Date:', startDate);
            
            const calendarGrid = document.getElementById('calendarGrid');
            
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            
            // Add day headers
            const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            dayHeaders.forEach(day => {
                const dayHeader = document.createElement('div');
                dayHeader.className = 'calendar-day-header';
                dayHeader.textContent = day;
                fragment.appendChild(dayHeader);
            });
            
            // FIXED: Pre-calculate programs for ALL visible days in the calendar grid
            const visibleEvents = new Map();
            const eventsData = getFilteredEvents();
            
            // Collect events for ALL dates that will be visible in the calendar
            eventsData.forEach(event => {
                if (!event.startDate) return;
                
                // Handle both date strings (YYYY-MM-DD) and Date objects/ISO strings
                let eventDate;
                if (typeof event.startDate === 'string') {
                    // If it's a date-only string (YYYY-MM-DD), treat it as EST date
                    if (/^\d{4}-\d{2}-\d{2}$/.test(event.startDate)) {
                        // Date-only string - extract components and create date
                        // This represents the date in EST, so we use the components directly
                        const [year, month, day] = event.startDate.split('-').map(Number);
                        // Create a date object - when we later convert to EST, it will be correct
                        eventDate = new Date(year, month - 1, day);
                    } else {
                        // ISO string with time - parse normally
                        eventDate = new Date(event.startDate);
                    }
                } else {
                    eventDate = new Date(event.startDate);
                }
                
                // Get EST date components for the event
                const eventDateEST = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York',
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric'
                }).formatToParts(eventDate);
                const eventYear = parseInt(eventDateEST.find(p => p.type === 'year').value);
                const eventMonth = parseInt(eventDateEST.find(p => p.type === 'month').value) - 1;
                const eventDay = parseInt(eventDateEST.find(p => p.type === 'day').value);
                
                // Create EST date objects for comparison
                const eventDateESTObj = new Date(eventYear, eventMonth, eventDay);
                const startDateESTObj = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                const endDateESTObj = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                
                // Check if event falls within the visible calendar range using EST
                if (eventDateESTObj >= startDateESTObj && eventDateESTObj <= endDateESTObj) {
                    // Create dateKey in YYYY-MM-DD format using EST date
                    const dateKey = `${eventYear}-${String(eventMonth + 1).padStart(2, '0')}-${String(eventDay).padStart(2, '0')}`;
                    if (!visibleEvents.has(dateKey)) {
                        visibleEvents.set(dateKey, []);
                    }
                    visibleEvents.get(dateKey).push(event);
                }
            });
            
            console.log(' - Month Events Map:', visibleEvents);
            
            // Calculate the number of weeks needed for this month
            const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            const weeksNeeded = Math.ceil(totalDays / 7);
            
            // Add calendar days
            // Get today's date in EST timezone for accurate comparison
            const estNow = getDateInEST();
            const todayYear = estNow.getFullYear();
            const todayMonth = estNow.getMonth();
            const todayDay = estNow.getDate();
            
            console.log('🔍 Today (EST):', `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`);
            
            for (let i = 0; i < weeksNeeded * 7; i++) {
                // Create cell date using EST dates (add days to startDate)
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + i);
                
                // Get EST date components for this cell
                const cellYear = cellDate.getFullYear();
                const cellMonth = cellDate.getMonth();
                const cellDay = cellDate.getDate();
                
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day';
                
                // Check if this day belongs to the current month
                const isCurrentMonth = cellMonth === month && cellYear === year;
                if (!isCurrentMonth) {
                    dayElement.classList.add('other-month');
                }
                
                // Debug first few days to verify accuracy
                if (i < 3) {
                    console.log(`🔍 Cell ${i}: EST (${cellYear}-${cellMonth+1}-${cellDay}), Today EST (${todayYear}-${todayMonth+1}-${todayDay})`);
                }
                
                // Compare year, month, and day components using EST
                if (cellYear === todayYear && cellMonth === todayMonth && cellDay === todayDay) {
                    dayElement.classList.add('today');
                    console.log('✅ Today highlighted correctly on cell:', i, `Date: ${cellYear}-${cellMonth+1}-${cellDay}`);
                }
                
                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                // Display the EST day number
                dayNumber.textContent = cellDay;
                dayElement.appendChild(dayNumber);
                
                // Show events only for days in the current month
                // Create dateKey in YYYY-MM-DD format using EST date
                const dateKey = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
                let dayEvents = [];
                
                // Only get events if this day belongs to the current month
                if (isCurrentMonth) {
                    dayEvents = visibleEvents.get(dateKey) || [];
                    
                    // Debug for the first day of the month
                    if (cellDay === 1 && cellMonth === month) {
                        console.log(' - Day 1 Debug:');
                        console.log('🔍   - Cell Date:', cellDate);
                        console.log('🔍   - Date Key:', dateKey);
                        console.log('🔍   - Events Found:', dayEvents.length);
                        console.log('🔍   - Events:', dayEvents);
                    }
                }
                
                if (dayEvents.length > 0) {
                    const eventsContainer = document.createElement('div');
                    eventsContainer.className = 'events-container';
                    
                    const maxVisible = window.innerWidth > 768 ? 3 : 2;
                    const visibleEvents = dayEvents.slice(0, maxVisible);
                    
                    visibleEvents.forEach(event => {
                        const eventTile = document.createElement('div');
                        eventTile.className = 'event-tile';
                        eventTile.textContent = event.title.length > 20 ? event.title.substring(0, 18) + '...' : event.title;
                        eventTile.title = `${event.title}\n${event.library || ''}\n${formatDate(event.startDate) || 'Date TBD'}`;
                        eventTile.onclick = (e) => {
                            e.stopPropagation();
                            showEventDetails(event.eventId);
                        };
                        eventsContainer.appendChild(eventTile);
                    });
                    
                    if (dayEvents.length > maxVisible) {
                        const moreTile = document.createElement('div');
                        moreTile.className = 'more-events';
                        moreTile.textContent = `+${dayEvents.length - maxVisible} more`;
                        moreTile.onclick = (e) => {
                            e.stopPropagation();
                            showDayEventsModal(cellDate, dayEvents);
                        };
                        eventsContainer.appendChild(moreTile);
                    }
                    
                    dayElement.addEventListener('click', () => {
                        showDayEventsModal(cellDate, dayEvents);
                    });
                    
                    dayElement.appendChild(eventsContainer);
                }
                
                fragment.appendChild(dayElement);
            }
            
            // Clear and append all at once
            calendarGrid.innerHTML = '';
            calendarGrid.appendChild(fragment);
            
            console.log(' Calendar rendering completed');
        }

        // Show day programs modal
        function showDayEventsModal(date, events) {
            const modal = document.getElementById('dayEventsModal');
            const modalTitle = document.getElementById('dayEventsModalTitle');
            const modalBody = document.getElementById('dayEventsModalBody');
            
            modalTitle.innerHTML = `
                <i class="fas fa-calendar-day me-2"></i>
                Programs for ${formatDate(date)}
            `;
            
            modalBody.innerHTML = '';
            
            if (events.length === 0) {
                modalBody.innerHTML = '<p class="text-muted text-center py-4">No programs on this day</p>';
            } else {
                events.forEach(event => {
                    const eventCard = document.createElement('div');
                    eventCard.className = 'day-event-card card';
                    eventCard.onclick = () => showEventDetails(event.eventId);
                    
                    const hasUrl = hasValidEventUrl(event);
                    const eventUrl = getEventPageUrl(event);
                    
                    eventCard.innerHTML = `
                        <div class="card-header">
                            <i class="fas fa-calendar-alt me-2"></i>
                            ${hasUrl ? `<a href="${eventUrl}" target="_blank" class="library-link">` : ''}
                            ${event.title}
                            ${hasUrl ? '</a>' : ''}
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <small class="text-muted">Library:</small><br>
                                    <strong>${event.library || 'Not specified'}</strong>
                                </div>
                                <div class="col-md-6">
                                    <small class="text-muted">Time:</small><br>
                                    <strong>${event.startTime || 'Time TBD'}</strong>
                                </div>
                            </div>
                            ${event.description ? `
                            <div class="mt-2">
                                <small class="text-muted">Description:</small><br>
                                <div class="text-truncate">${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}</div>
                            </div>
                            ` : ''}
                            <div class="mt-2">
                                <span class="badge bg-primary me-2">${event.category || 'General'}</span>
                                <span class="badge bg-secondary">${event.ageGroup || 'All ages'}</span>
                            </div>
                        </div>
                    `;
                    
                    modalBody.appendChild(eventCard);
                });
            }
            
            const bootstrapModal = new bootstrap.Modal(modal);
            bootstrapModal.show();
        }

        // Get programs for a specific date
        function getEventsForDate(date) {
            const dateStr = date.toISOString().split('T')[0];
            return getFilteredEvents().filter(event => {
                if (!event.startDate) return false;
                const eventDateStr = event.startDate.split('T')[0];
                return eventDateStr === dateStr;
            });
        }

        // Get filtered events
        function getFilteredEvents() {
            return filteredEvents || [];
        }

        // Show program details in modal
        function showEventDetails(eventId) {
            // Check if we're in new programs view and search there first
            const isNewProgramsView = document.getElementById('newProgramsContainer') && 
                                      document.getElementById('newProgramsContainer').style.display !== 'none';
            
            let event = null;
            if (isNewProgramsView && newProgramsEvents.length > 0) {
                event = newProgramsEvents.find(e => e.eventId === eventId);
            }
            
            // Fallback to allEvents if not found in newProgramsEvents
            if (!event) {
                event = allEvents.find(e => e.eventId === eventId);
            }
            
            if (!event) return;

            const eventUrl = getEventPageUrl(event);
            const hasUrl = hasValidEventUrl(event);

            const modalBody = document.getElementById('eventModalBody');
            modalBody.innerHTML = `
                <div class="event-detail-item">
                    <div class="event-detail-label">Title</div>
                    <div>${event.title || 'No title'}</div>
                </div>
                <div class="event-detail-item">
                    <div class="event-detail-label">Description</div>
                    <div>${event.description || 'No description available'}</div>
                </div>
                <div class="event-detail-item">
                    <div class="event-detail-label">Library</div>
                    <div>${event.library || 'Not specified'}</div>
                </div>
                ${hasUrl ? `
                <div class="event-detail-item">
                    <div class="event-detail-label">Program Page</div>
                    <div>
                        <a href="${eventUrl}" target="_blank" class="library-link">
                            <i class="fas fa-external-link-alt me-1"></i>
                            View Program Page
                        </a>
                    </div>
                </div>
                ` : ''}
                <div class="event-detail-item">
                    <div class="event-detail-label">Date & Time</div>
                    <div>
                        ${event.startDate ? event.startDate.split('T')[0] : 'Date TBD'}
                        ${event.startTime ? `at ${event.startTime}` : ''}
                    </div>
                </div>
                <div class="event-detail-item">
                    <div class="event-detail-label">Category</div>
                    <div>${event.category || 'Not specified'}</div>
                </div>
                <div class="event-detail-item">
                    <div class="event-detail-label">Age Group</div>
                    <div>${event.ageGroup || 'All ages'}</div>
                </div>
                ${event.registrationRequired ? `
                <div class="event-detail-item">
                    <div class="event-detail-label">Registration</div>
                    <div class="text-warning">
                        <i class="fas fa-exclamation-triangle me-1"></i>
                        Registration required
                    </div>
                </div>
                ` : ''}
                ${event.contactInfo ? `
                <div class="event-detail-item">
                    <div class="event-detail-label">Contact</div>
                    <div>${event.contactInfo}</div>
                </div>
                ` : ''}
            `;

            const modal = new bootstrap.Modal(document.getElementById('eventModal'));
            modal.show();
        }

        // Utility functions
        function formatDate(dateString) {
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch (error) {
                return dateString;
            }
        }

        // Enhanced debounce function
        function debounce(func, wait, immediate) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    timeout = null;
                    if (!immediate) func(...args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func(...args);
            };
        }

        // Enhanced error handling
        function handleLocationError(error) {
            let errorMessage = 'Could not get your location. ';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage += 'Please allow location access in your browser settings and try again.';
                    showLocationError(errorMessage, 'permission');
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage += 'Location information is unavailable. Please check your device settings.';
                    showLocationError(errorMessage, 'unavailable');
                    break;
                case error.TIMEOUT:
                    errorMessage += 'Location request timed out. Please try again.';
                    showLocationError(errorMessage, 'timeout');
                    break;
                default:
                    errorMessage += 'An unknown error occurred.';
                    showLocationError(errorMessage, 'unknown');
            }
        }

        // New function to show location success
        function showLocationSuccess(message) {
            // Create a temporary success notification
            const notification = document.createElement('div');
            notification.className = 'alert alert-success alert-dismissible fade show position-fixed';
            notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 300px;';
            notification.innerHTML = `
                <i class="fas fa-check-circle me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            
            document.body.appendChild(notification);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }

        // Enhanced error display
        function showLocationError(message, type = 'general') {
            const notification = document.createElement('div');
            notification.className = 'alert alert-warning alert-dismissible fade show position-fixed';
            notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 300px;';
            
            let icon = 'fas fa-exclamation-triangle';
            if (type === 'permission') {
                icon = 'fas fa-lock';
            } else if (type === 'unavailable') {
                icon = 'fas fa-map-marker-slash';
            } else if (type === 'timeout') {
                icon = 'fas fa-clock';
            }
            
            notification.innerHTML = `
                <i class="${icon} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            
            document.body.appendChild(notification);
            
            // Auto-remove after 8 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 8000);
        }

        // New function to check for stored location on page load
        function checkStoredLocation() {
            const storedLocation = localStorage.getItem('userLocation');
            if (storedLocation) {
                try {
                    const location = JSON.parse(storedLocation);
                    const age = Date.now() - location.timestamp;
                    
                    // Use stored location if it's less than 30 minutes old
                    if (age < 30 * 60 * 1000) {
                        console.log('📍 Using stored location');
                        updateMapWithUserLocation(location.lat, location.lng, location.accuracy);
                        return true;
                    }
                } catch (error) {
                    console.error('Error parsing stored location:', error);
                }
            }
            return false;
        }

        // New function to update map with user location
        function updateMapWithUserLocation(lat, lng, accuracy) {
            // Remove existing current location marker
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
                if (currentLocationMarker.accuracyCircle) {
                    map.removeLayer(currentLocationMarker.accuracyCircle);
                }
            }
            
            // Add current location marker with lower z-index so library markers are on top
            // Use negative z-index so library markers (z-index 100) are clickable above it
            currentLocationMarker = L.marker([lat, lng], { 
                icon: currentLocationIcon,
                zIndexOffset: -100  // Lower than library markers so they're clickable
            });
            
            const locationPopupOptions = createPopupOptions();
            
            currentLocationMarker.bindPopup(`
                <div style="text-align: center;">
                    <strong>📍 Your Location</strong><br>
                    <small>Accuracy: ~${Math.round(accuracy)}m</small><br>
                    <button onclick="findNearestLibraries(${lat}, ${lng})" class="btn btn-sm btn-primary mt-2" style="min-height: 44px; touch-action: manipulation;">
                        Find Nearest Libraries
                    </button>
                </div>
            `, locationPopupOptions);
            
            // Don't auto-open popup to avoid blocking library markers
            // User can click on the location marker if they want to see it
            currentLocationMarker.addTo(map);
            
            // Center map on current location
            map.setView([lat, lng], 14);
            
            // Add accuracy circle
            const accuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                fillColor: '#4285f4',
                fillOpacity: 0.1,
                color: '#4285f4',
                weight: 1,
                interactive: false  // Make circle non-interactive so it doesn't block clicks
            }).addTo(map);
            
            currentLocationMarker.accuracyCircle = accuracyCircle;
        }

        // Request location permission on page load
        function requestLocationPermission() {
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query({ name: 'geolocation' }).then(function(result) {
                    if (result.state === 'granted') {
                        console.log('✅ Location permission already granted');
                        // Optionally auto-detect location
                        // findCurrentLocation();
                    } else if (result.state === 'prompt') {
                        console.log('📍 Location permission will be requested when needed');
                    } else if (result.state === 'denied') {
                        console.log('❌ Location permission denied');
                        showLocationError('Location access is blocked. Please enable it in your browser settings.', 'permission');
                    }
                });
            }
        }

        // Add event listener for distance filter
        document.getElementById('distanceFilter').addEventListener('change', filterEvents);

        // Apply debouncing to search input
        document.getElementById('searchInput').addEventListener('input', debounce(filterEvents, 300));

        // Add this to your filter section in the HTML
        // Add this inside the filter-section div, after the existing filters:

        // Add this JavaScript function:

        // Add this to your navbar, after the existing navbar-text
        // Add this to the navbar, after the existing navbar-text
        function updateLocationStatus() {
            const storedLocation = localStorage.getItem('userLocation');
            const statusElement = document.getElementById('locationStatusText');
            const iconElement = document.getElementById('locationStatus').querySelector('i');
            
            if (storedLocation) {
                try {
                    const location = JSON.parse(storedLocation);
                    const age = Date.now() - location.timestamp;
                    
                    if (age < 30 * 60 * 1000) { // Less than 30 minutes old
                        statusElement.textContent = 'Location available';
                        iconElement.className = 'fas fa-map-marker-alt me-1 text-success';
                    } else {
                        statusElement.textContent = 'Location expired';
                        iconElement.className = 'fas fa-map-marker-alt me-1 text-warning';
                    }
                } catch (error) {
                    statusElement.textContent = 'Location error';
                    iconElement.className = 'fas fa-map-marker-alt me-1 text-danger';
                }
            } else {
                statusElement.textContent = 'Location not set';
                iconElement.className = 'fas fa-map-marker-alt me-1 text-muted';
            }
        }

        // Call this function after location operations
        // Add to findCurrentLocation() and checkStoredLocation()

        // Add performance monitoring
        function measurePerformance(name, fn) {
            return function(...args) {
                const start = performance.now();
                const result = fn.apply(this, args);
                const end = performance.now();
                console.log(`⏱️ ${name} took ${(end - start).toFixed(2)}ms`);
                return result;
            };
        }

        // Wrap key functions with performance monitoring
        const originalFilterEvents = filterEvents;
        filterEvents = measurePerformance('filterEvents', originalFilterEvents);

        const originalRenderCalendar = renderCalendar;
        renderCalendar = measurePerformance('renderCalendar', originalRenderCalendar);

        const originalUpdateMapMarkers = updateMapMarkers;
        updateMapMarkers = measurePerformance('updateMapMarkers', originalUpdateMapMarkers);

        // Add this function to handle location permission requests
        function requestLocationForDistanceFilter() {
            if (!navigator.geolocation) {
                showLocationError('Geolocation is not supported by this browser.');
                return false;
            }

            // Check if we already have location permission
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query({ name: 'geolocation' }).then(function(result) {
                    if (result.state === 'granted') {
                        // Permission already granted, get location
                        getCurrentLocationForFilter();
                    } else if (result.state === 'prompt') {
                        // Permission not determined, request it
                        getCurrentLocationForFilter();
                    } else if (result.state === 'denied') {
                        // Permission denied, show error
                        showLocationError('Location access is required for distance filtering. Please enable it in your browser settings.', 'permission');
                        // Reset the distance filter
                        document.getElementById('distanceFilter').value = '';
                    }
                });
            } else {
                // Fallback for browsers that don't support permissions API
                getCurrentLocationForFilter();
            }
        }

        // Function to get current location specifically for filtering
        function getCurrentLocationForFilter() {
            const locationBtn = document.getElementById('locationBtn');
            
            // Show loading state on the location button
            locationBtn.classList.add('loading');
            locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            locationBtn.title = 'Getting location for filter...';
            
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    
                    console.log(`📍 Location obtained for filter: ${lat}, ${lng} (accuracy: ${accuracy}m)`);
                    
                    // Store user location
                    localStorage.setItem('userLocation', JSON.stringify({
                        lat: lat,
                        lng: lng,
                        accuracy: accuracy,
                        timestamp: Date.now()
                    }));
                    
                    // Update location cache
                    userLocationCache = { lat, lng, accuracy };
                    
                    // Reset button state
                    locationBtn.classList.remove('loading');
                    locationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                    locationBtn.title = 'Location found! Click to update';
                    
                    // Show success message
                    showLocationSuccess(`Location obtained! Distance filter is now active.`);
                    
                    // Update the map if we're in map view
                    if (map && currentLocationMarker) {
                        updateMapWithUserLocation(lat, lng, accuracy);
                    }
                    
                    // Apply the filter
                    filterEvents();
                    
                },
                function(error) {
                    console.error('❌ Location error for filter:', error);
                    handleLocationError(error);
                    
                    // Reset button state
                    locationBtn.classList.remove('loading');
                    locationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                    locationBtn.title = 'Find my location';
                    
                    // Reset the distance filter since we couldn't get location
                    document.getElementById('distanceFilter').value = '';
                    
                    // Apply filters without distance
                    filterEvents();
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 300000 // 5 minutes
                }
            );
        }

        // Update the setupEventListeners function to handle distance filter changes
        function setupEventListeners() {
            // Use event delegation for filter changes
            document.addEventListener('change', function(e) {
                // Handle checkbox filter changes
                if (e.target.matches('input[type="checkbox"][data-filter-type]')) {
                    filterEvents();
                } else if (e.target.matches('#dateFilter')) {
                    filterEvents();
                } else if (e.target.matches('#distanceFilter')) {
                    handleDistanceFilterChange(e.target.value);
                } else if (e.target.matches('#daysSelector')) {
                    // Handle days selector change for new programs view
                    const days = parseInt(e.target.value, 10);
                    console.log(`📅 Days selector changed to ${days} days`);
                    loadNewPrograms(days);
                }
            });
            
            // Use event delegation for buttons
            document.addEventListener('click', function(e) {
                if (e.target.matches('#clearFilters')) {
                    clearFilters();
                } else if (e.target.matches('#clearDateFilter')) {
                    document.getElementById('dateFilter').value = '';
                    filterEvents();
                } else if (e.target.matches('#locationBtn')) {
                    findCurrentLocation();
                } else if (e.target.matches('#prevMonth')) {
                    currentDate.setMonth(currentDate.getMonth() - 1);
                    renderCalendar();
                } else if (e.target.matches('#nextMonth')) {
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    renderCalendar();
                } else if (e.target.matches('#todayBtn')) {
                    currentDate = getDateInEST();
                    renderCalendar();
                }
            });
            
            // View toggle
            document.querySelectorAll('input[name="view"]').forEach(input => {
                input.addEventListener('change', function() {
                    if (this.value === 'calendar') {
                        showCalendarView();
                    } else if (this.value === 'map') {
                        showMapView();
                    } else if (this.value === 'new') {
                        showNewProgramsView();
                    }
                });
            });
            
            // Days selector for new programs - also attach directly as backup
            const daysSelector = document.getElementById('daysSelector');
            if (daysSelector) {
                daysSelector.addEventListener('change', function() {
                    const days = parseInt(this.value, 10);
                    console.log(`📅 Days selector changed to ${days} days (direct listener)`);
                    loadNewPrograms(days);
                });
            }
        }

        // New function to handle distance filter changes
        function handleDistanceFilterChange(distanceValue) {
            if (!distanceValue) {
                // Distance filter cleared, just apply filters
                filterEvents();
                return;
            }
            
            // Check if we have stored location
            const storedLocation = localStorage.getItem('userLocation');
            if (storedLocation) {
                try {
                    const location = JSON.parse(storedLocation);
                    const age = Date.now() - location.timestamp;
                    
                    // Use stored location if it's less than 30 minutes old
                    if (age < 30 * 60 * 1000) {
                        console.log('📍 Using stored location for distance filter');
                        userLocationCache = location;
                        filterEvents();
                        return;
                    }
                } catch (error) {
                    console.error('Error parsing stored location:', error);
                }
            }
            
            // No valid stored location, request permission
            console.log('📍 No valid stored location, requesting permission for distance filter');
            requestLocationForDistanceFilter();
        }

        // Update the clearFilters function to also clear distance filter
        function clearFilters() {
            document.getElementById('searchInput').value = '';
            
            // Uncheck all filter checkboxes
            document.querySelectorAll('input[type="checkbox"][data-filter-type]').forEach(checkbox => {
                checkbox.checked = false;
            });
            
            document.getElementById('dateFilter').value = '';
            document.getElementById('distanceFilter').value = ''; // Clear distance filter too
            filterEvents();
            updateActiveFiltersDisplay();
        }

        // Add this helper function for timezone-safe date handling
        function getDateKey(date) {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // Helper function to create timezone-safe date objects
        function createUTCDate(year, month, day) {
            return new Date(Date.UTC(year, month, day));
        }

        // Helper function to check if a date belongs to a specific month (timezone-safe)
        function isDateInMonth(date, targetYear, targetMonth) {
            return date.getUTCFullYear() === targetYear && date.getUTCMonth() === targetMonth;
        }
        
        // Contact Form Functionality
        document.addEventListener('DOMContentLoaded', function() {
            const contactForm = document.getElementById('contactForm');
            const contactSubmitBtn = document.getElementById('contactSubmitBtn');
            const contactFormAlert = document.getElementById('contactFormAlert');
            const contactMessage = document.getElementById('contactMessage');
            const charCount = document.getElementById('charCount');
            
            // Character counter for message
            if (contactMessage && charCount) {
                contactMessage.addEventListener('input', function() {
                    charCount.textContent = this.value.length;
                    if (this.value.length > 1800) {
                        charCount.classList.add('text-warning');
                    } else {
                        charCount.classList.remove('text-warning');
                    }
                });
            }
            
            // Handle form submission
            if (contactForm) {
                contactForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    // Hide previous alerts
                    contactFormAlert.classList.add('d-none');
                    contactFormAlert.classList.remove('alert-success', 'alert-danger');
                    
                    // Disable submit button
                    contactSubmitBtn.disabled = true;
                    contactSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Sending...';
                    
                    // Get form data
                    const formData = {
                        name: document.getElementById('contactName').value.trim(),
                        email: document.getElementById('contactEmail').value.trim(),
                        subject: document.getElementById('contactSubject').value,
                        message: document.getElementById('contactMessage').value.trim()
                    };
                    
                    try {
                        const response = await fetch('/api/contact', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(formData)
                        });
                        
                        const data = await response.json();
                        
                        if (response.ok && data.success) {
                            // Success
                            contactFormAlert.classList.remove('d-none');
                            contactFormAlert.classList.add('alert-success');
                            contactFormAlert.innerHTML = '<i class="fas fa-check-circle me-2"></i>' + data.message;
                            
                            // Reset form
                            contactForm.reset();
                            if (charCount) charCount.textContent = '0';
                            
                            // Close modal after 2 seconds
                            setTimeout(() => {
                                const modalElement = document.getElementById('contactModal');
                                const modal = bootstrap.Modal.getInstance(modalElement);
                                if (modal) {
                                    modal.hide();
                                }
                                // Clear alert after modal closes
                                setTimeout(() => {
                                    contactFormAlert.classList.add('d-none');
                                }, 300);
                            }, 2000);
                        } else {
                            // Error
                            contactFormAlert.classList.remove('d-none');
                            contactFormAlert.classList.add('alert-danger');
                            contactFormAlert.innerHTML = '<i class="fas fa-exclamation-circle me-2"></i>' + (data.error || 'An error occurred. Please try again.');
                        }
                    } catch (error) {
                        console.error('Contact form error:', error);
                        contactFormAlert.classList.remove('d-none');
                        contactFormAlert.classList.add('alert-danger');
                        contactFormAlert.innerHTML = '<i class="fas fa-exclamation-circle me-2"></i>Network error. Please check your connection and try again.';
                    } finally {
                        // Re-enable submit button
                        contactSubmitBtn.disabled = false;
                        contactSubmitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Send Feedback';
                    }
                });
            }
            
            // Reset form when modal is closed
            const contactModal = document.getElementById('contactModal');
            if (contactModal) {
                contactModal.addEventListener('hidden.bs.modal', function() {
                    if (contactForm) contactForm.reset();
                    if (contactFormAlert) contactFormAlert.classList.add('d-none');
                    if (charCount) charCount.textContent = '0';
                });
            }
        });
